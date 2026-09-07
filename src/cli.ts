import pkg from "../package.json" with { type: "json" };
import { parseArgs, str, int, bool } from "./args.ts";
import { loadConfig } from "./config.ts";
import { getProvider, parsePhotoRef, providerNames, DEFAULT_PROVIDER } from "./providers/index.ts";
import { ProviderError, type Orientation } from "./providers/types.ts";
import { renderPage } from "./commands/list.ts";
import { showPhoto } from "./commands/show.ts";
import { downloadPhotos } from "./commands/download.ts";
import { openExternal } from "./commands/open.ts";
import { authSet, authStatus } from "./commands/auth.ts";
import { clearCache, cacheDir } from "./cache.ts";
import { bold, dim, red, yellow } from "./render/style.ts";
import { detectProtocol, insideTmux } from "./render/terminal.ts";

const BOOLEANS = ["json", "preview", "help", "version", "open", "force", "quiet"];
const ALIASES: Record<string, string> = {
  n: "per-page", p: "page", o: "out", s: "size", h: "help", v: "version", q: "quiet", f: "force", P: "provider",
};

const HELP = `${bold("fabpix")} ${dim("v" + pkg.version)} — stock photos in your terminal

${bold("Usage")}
  fabpix search <query…>        Search photos (previews inline where supported)
  fabpix curated                Browse curated / trending photos
  fabpix show <id>              Larger preview + full metadata for one photo
  fabpix download <id…>         Save photo(s) to disk
  fabpix open <id>              Open the photo's web page in your browser
  fabpix auth set <key>         Store an API key   (or export PEXELS_API_KEY)
  fabpix auth status            Check which key is in use and whether it works
  fabpix cache clear            Remove cached API responses and thumbnails

${bold("Options")}
  -n, --per-page <n>     Results per page (default 10, max 80)
  -p, --page <n>         Page number
      --orientation <o>  landscape | portrait | square
      --color <c>        Colour filter, e.g. red or #ff0000
      --size <s>         search: min size (large|medium|small)
                         download: variant (original|large2x|large|medium|small…)
  -o, --out <path>       download: directory or file path
  -f, --force            download: overwrite existing files
      --open             download: open the file afterwards
  -P, --provider <name>  Photo provider (default: ${DEFAULT_PROVIDER}; available: ${providerNames().join(", ")})
      --rows <n>         Thumbnail height in terminal rows (default 8, show: 20)
      --cols <n>         Thumbnail width in terminal columns (default 24, show: 60)
      --no-preview       Text only, no inline images
      --json             Machine-readable output
  -h, --help             Show this help
  -v, --version          Show version

${bold("Previews")}
  Inline images work in iTerm2, WezTerm, kitty and Ghostty. Other terminals use
  chafa (if installed) or a colour swatch. Inside tmux, set: allow-passthrough on
  Force a protocol with FABPIX_PROTOCOL=iterm|kitty|chafa|none.

${bold("Examples")}
  fabpix search mountain lake --orientation landscape -n 5
  fabpix show 1054666
  fabpix download 1054666 --size large2x -o ~/Pictures
  fabpix search cats --json | jq '.photos[].pageUrl'
`;

function fail(message: string, hint?: string): never {
  process.stderr.write(red("error: ") + message + "\n");
  if (hint) process.stderr.write(dim(hint) + "\n");
  process.exit(1);
}

async function main(argv: string[]): Promise<void> {
  const { positional, flags } = parseArgs(argv, { booleans: BOOLEANS, aliases: ALIASES });
  const [command, ...rest] = positional;

  if (bool(flags.version, false)) {
    process.stdout.write(pkg.version + "\n");
    return;
  }
  if (!command || bool(flags.help, false) || command === "help") {
    process.stdout.write(HELP);
    return;
  }

  const config = loadConfig();
  const providerName = str(flags.provider) ?? config.defaultProvider ?? DEFAULT_PROVIDER;
  const preview = bool(flags.preview, true);
  const json = bool(flags.json, false);
  const isShow = command === "show";
  const rows = int(flags.rows, config.preview?.rows ?? (isShow ? 20 : 8));
  const cols = int(flags.cols, config.preview?.cols ?? (isShow ? 60 : 24));
  const page = int(flags.page, 1);
  const perPage = int(flags["per-page"], 10);

  if (preview && !json && insideTmux() && detectProtocol() === "iterm" && !process.env.FABPIX_QUIET_TMUX) {
    process.stderr.write(yellow("note: ") + dim("inside tmux — previews need `set -g allow-passthrough on` in ~/.tmux.conf") + "\n");
  }

  switch (command) {
    case "search": {
      const query = rest.join(" ").trim();
      if (!query) fail("search needs a query.", "example: fabpix search mountain lake");
      const provider = getProvider({ name: providerName, config });
      const result = await provider.search({
        query,
        page,
        perPage,
        orientation: str(flags.orientation) as Orientation | undefined,
        color: str(flags.color),
        size: str(flags.size),
        locale: str(flags.locale),
      });
      const flagsText = [
        flags.orientation ? `--orientation ${flags.orientation}` : "",
        flags.color ? `--color ${flags.color}` : "",
        perPage !== 10 ? `-n ${perPage}` : "",
      ].filter(Boolean).join(" ");
      await renderPage(result, {
        preview, json, rows, cols,
        title: `${provider.name} · "${query}"`,
        nextCommand: `fabpix search ${JSON.stringify(query)} ${flagsText} -p ${page + 1}`.replace(/\s+/g, " "),
      });
      return;
    }

    case "curated":
    case "popular":
    case "trending": {
      const provider = getProvider({ name: providerName, config });
      const result = await provider.curated({ page, perPage });
      await renderPage(result, {
        preview, json, rows, cols,
        title: `${provider.name} · curated`,
        nextCommand: `fabpix curated${perPage !== 10 ? ` -n ${perPage}` : ""} -p ${page + 1}`,
      });
      return;
    }

    case "show":
    case "info": {
      const ref = rest[0];
      if (!ref) fail("show needs a photo id.", "example: fabpix show 1054666");
      const { provider: pName, id } = parsePhotoRef(ref, providerName);
      await showPhoto(getProvider({ name: pName, config }), { id, preview, json, rows, cols });
      return;
    }

    case "download":
    case "dl":
    case "get": {
      if (rest.length === 0) fail("download needs at least one photo id.", "example: fabpix download 1054666 --size large2x");
      // Group ids by provider so "pexels:1 unsplash:2" both work in one call.
      const groups = new Map<string, string[]>();
      for (const ref of rest) {
        const { provider: pName, id } = parsePhotoRef(ref, providerName);
        groups.set(pName, [...(groups.get(pName) ?? []), id]);
      }
      const files: string[] = [];
      for (const [pName, ids] of groups) {
        files.push(
          ...(await downloadPhotos(getProvider({ name: pName, config }), {
            ids,
            size: str(flags.size),
            out: str(flags.out),
            force: bool(flags.force, false),
            quiet: bool(flags.quiet, false) || json,
          })),
        );
      }
      if (json) process.stdout.write(JSON.stringify({ files }, null, 2) + "\n");
      if (bool(flags.open, false)) for (const f of files) openExternal(f);
      return;
    }

    case "open": {
      const ref = rest[0];
      if (!ref) fail("open needs a photo id.");
      const { provider: pName, id } = parsePhotoRef(ref, providerName);
      const photo = await getProvider({ name: pName, config }).get(id);
      openExternal(photo.pageUrl);
      process.stdout.write(dim("opened ") + photo.pageUrl + "\n");
      return;
    }

    case "auth": {
      const sub = rest[0];
      if (sub === "set") {
        const key = rest[1];
        if (!key) fail("auth set needs a key.", "example: fabpix auth set 563492ad6f917000010000...");
        authSet(providerName, key);
        return;
      }
      if (sub === "status" || sub === undefined) {
        await authStatus(providerName);
        return;
      }
      fail(`unknown auth subcommand "${sub}".`, "use: fabpix auth set <key> | fabpix auth status");
    }

    case "cache": {
      const sub = rest[0];
      if (sub === "clear" || sub === "clean") {
        process.stdout.write((clearCache() ? "cleared " : "nothing to clear at ") + cacheDir() + "\n");
        return;
      }
      if (sub === "path" || sub === undefined) {
        process.stdout.write(cacheDir() + "\n");
        return;
      }
      fail(`unknown cache subcommand "${sub}".`, "use: fabpix cache clear | fabpix cache path");
    }

    default:
      fail(`unknown command "${command}".`, "run: fabpix --help");
  }
}

/**
 * Flush stdout then exit explicitly. Without this, Node's fetch keeps HTTP
 * keep-alive sockets open and the process lingers ~4 s after the work is done.
 * (stdout to a pipe is async on macOS, so wait for the drain callback first.)
 */
function exitWhenFlushed(code: number): void {
  process.stdout.write("", () => process.exit(code));
}

main(process.argv.slice(2))
  .then(() => exitWhenFlushed(Number(process.exitCode ?? 0)))
  .catch((err: unknown) => {
    if (err instanceof ProviderError) fail(err.message, err.hint);
    if (err instanceof Error) fail(err.message);
    fail(String(err));
  });

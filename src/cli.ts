import pkg from "../package.json" with { type: "json" };
import { parseArgs, str, int, bool } from "./args.ts";
import { loadSettings, type Scope } from "./config.ts";
import { getProvider, parsePhotoRef, providerNames, DEFAULT_PROVIDER } from "./providers/index.ts";
import { ProviderError, type Orientation } from "./providers/types.ts";
import { listPhotos, type Layout } from "./commands/list.ts";
import { showPhoto } from "./commands/show.ts";
import { downloadPhotos } from "./commands/download.ts";
import { openExternal } from "./commands/open.ts";
import { authSet, authStatus } from "./commands/auth.ts";
import { configGet, configInit, configPaths, configSet, configShow } from "./commands/config.ts";
import { credits, CREDITS_FORMATS, type CreditsFormat } from "./commands/credits.ts";
import { METADATA_MODES, type MetadataMode } from "./manifest.ts";
import { clearCache, cacheDir } from "./cache.ts";
import { bold, dim, red, yellow } from "./render/style.ts";
import { detectProtocol, insideTmux } from "./render/terminal.ts";

const BOOLEANS = ["json", "preview", "help", "version", "open", "force", "quiet", "pager", "global", "local"];
const ALIASES: Record<string, string> = {
  n: "per-page", p: "page", o: "out", s: "size", h: "help", v: "version", q: "quiet", f: "force", P: "provider",
};

const HELP = `${bold("fabpix")} ${dim("v" + pkg.version)} — stock photos in your terminal

${bold("Usage")}
  fabpix search <query…>        Search photos (previews inline where supported)
  fabpix curated                Browse curated / trending photos
  fabpix show <id>              Larger preview + full metadata for one photo
  fabpix download <id…>         Save photo(s) to disk (+ fabpix.manifest.json with credits)
  fabpix credits [dir]          Attribution list from a folder's manifest (--format text|markdown|json)
  fabpix open <id>              Open the photo's web page in your browser
  fabpix auth set <key>         Store an API key   (or export PEXELS_API_KEY)
  fabpix auth status            Check which key is in use and whether it works
  fabpix cache clear            Remove cached API responses and thumbnails
  fabpix config                 Show effective settings and where they came from
  fabpix config init [--global] Write a starter .fabpixrc here (or the global file)
  fabpix config set <key> <v>   e.g. download.dir ./assets  (--global for the global file)
  fabpix config get <key>       Print one setting
  fabpix config paths           Show which settings files are consulted

${bold("Options")}
  -n, --per-page <n>     Results per page (default: fills the screen; max 80)
  -p, --page <n>         Page number
      --orientation <o>  landscape | portrait | square
      --color <c>        Colour filter, e.g. red or #ff0000
      --size <s>         search: min size (large|medium|small)
                         download: variant (original|large2x|large|medium|small…)
  -o, --out <path>       download: directory or file path
  -f, --force            download: overwrite existing files
      --open             download: open the file afterwards
      --metadata <m>     download: manifest (default) | sidecar | both | none
      --format <f>       credits: text (default) | markdown | json
  -P, --provider <name>  Photo provider (default: ${DEFAULT_PROVIDER}; available: ${providerNames().join(", ")})
      --layout <l>       grid | list (default: grid when inline images work)
      --rows <n>         Thumbnail height in terminal rows (default 8, show: 20)
      --cols <n>         Thumbnail width in terminal columns (default 24, show: 60)
      --no-preview       Text only, no inline images
      --no-pager         Print one page and exit instead of waiting for a key
      --json             Machine-readable output
  -h, --help             Show this help
  -v, --version          Show version

${bold("Settings")}
  Global:  ~/.config/fabpix/config.json  (or ~/.fabpixrc)
  Project: nearest .fabpixrc / .fabpixrc.json / fabpix.json / package.json "fabpix" key,
           searched upward from the current folder. Project overrides global, flags override both.
  Keys: provider, preview.{enabled,layout,protocol,rows,cols}, search.{perPage,orientation,size,locale},
        download.{dir,size,overwrite,metadata}, pager. A relative download.dir is resolved from the file's folder.

${bold("Paging")}
  In a terminal, results page interactively: space/→ next page, ←/b back,
  q or esc to stop. The next page is prefetched while you look.

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

  const { settings } = loadSettings();
  if (settings.preview?.protocol && !process.env.FABPIX_PROTOCOL) process.env.FABPIX_PROTOCOL = settings.preview.protocol;
  const providerName = str(flags.provider) ?? settings.provider ?? DEFAULT_PROVIDER;
  const preview = bool(flags.preview, settings.preview?.enabled ?? true);
  const json = bool(flags.json, false);
  const isShow = command === "show";
  const rows = int(flags.rows, isShow ? settings.preview?.showRows ?? 20 : settings.preview?.rows ?? 8);
  const cols = int(flags.cols, isShow ? settings.preview?.showCols ?? 60 : settings.preview?.cols ?? 24);
  const page = int(flags.page, 1);
  const perPage = flags["per-page"] !== undefined ? int(flags["per-page"], 10) : settings.search?.perPage;
  const layout = (str(flags.layout) ?? settings.preview?.layout) as Layout | undefined;
  if (layout !== undefined && layout !== "grid" && layout !== "list") fail(`--layout must be grid or list, got "${layout}".`);
  const pager = bool(flags.pager, settings.pager ?? true);
  const listOpts = { preview, json, rows, cols, layout, perPage, pager };
  const orientation = (str(flags.orientation) ?? settings.search?.orientation) as Orientation | undefined;

  if (preview && !json && insideTmux() && detectProtocol() === "iterm" && !process.env.FABPIX_QUIET_TMUX) {
    process.stderr.write(yellow("note: ") + dim("inside tmux — previews need `set -g allow-passthrough on` in ~/.tmux.conf") + "\n");
  }

  switch (command) {
    case "search": {
      const query = rest.join(" ").trim();
      if (!query) fail("search needs a query.", "example: fabpix search mountain lake");
      const provider = getProvider({ name: providerName, settings });
      const flagsText = [
        flags.orientation ? `--orientation ${flags.orientation}` : "",
        flags.color ? `--color ${flags.color}` : "",
        perPage !== undefined ? `-n ${perPage}` : "",
      ].filter(Boolean).join(" ");
      await listPhotos(
        (p, n) => provider.search({
          query, page: p, perPage: n,
          orientation,
          color: str(flags.color) ?? settings.search?.color,
          size: str(flags.size) ?? settings.search?.size,
          locale: str(flags.locale) ?? settings.search?.locale,
        }),
        {
          ...listOpts,
          startPage: page,
          title: `${provider.name} · "${query}"`,
          commandFor: (p) => `fabpix search ${JSON.stringify(query)} ${flagsText} -p ${p}`.replace(/\s+/g, " "),
        },
      );
      return;
    }

    case "curated":
    case "popular":
    case "trending": {
      const provider = getProvider({ name: providerName, settings });
      await listPhotos((p, n) => provider.curated({ page: p, perPage: n }), {
        ...listOpts,
        startPage: page,
        title: `${provider.name} · curated`,
        commandFor: (p) => `fabpix curated${perPage !== undefined ? ` -n ${perPage}` : ""} -p ${p}`,
      });
      return;
    }

    case "show":
    case "info": {
      const ref = rest[0];
      if (!ref) fail("show needs a photo id.", "example: fabpix show 1054666");
      const { provider: pName, id } = parsePhotoRef(ref, providerName);
      await showPhoto(getProvider({ name: pName, settings }), { id, preview, json, rows, cols });
      return;
    }

    case "download":
    case "dl":
    case "get": {
      if (rest.length === 0) fail("download needs at least one photo id.", "example: fabpix download 1054666 --size large2x");
      const metadata = (str(flags.metadata) ?? settings.download?.metadata ?? "manifest") as MetadataMode;
      if (!METADATA_MODES.includes(metadata)) fail(`--metadata must be one of ${METADATA_MODES.join(", ")}, got "${metadata}".`);
      // Group ids by provider so "pexels:1 unsplash:2" both work in one call.
      const groups = new Map<string, string[]>();
      for (const ref of rest) {
        const { provider: pName, id } = parsePhotoRef(ref, providerName);
        groups.set(pName, [...(groups.get(pName) ?? []), id]);
      }
      const files: string[] = [];
      for (const [pName, ids] of groups) {
        files.push(
          ...(await downloadPhotos(getProvider({ name: pName, settings }), {
            ids,
            size: str(flags.size) ?? settings.download?.size,
            out: str(flags.out) ?? settings.download?.dir,
            force: bool(flags.force, settings.download?.overwrite ?? false),
            quiet: bool(flags.quiet, false) || json,
            metadata,
          })),
        );
      }
      if (json) process.stdout.write(JSON.stringify({ files }, null, 2) + "\n");
      if (bool(flags.open, false)) for (const f of files) openExternal(f);
      return;
    }

    case "credits":
    case "attribution": {
      const format = (str(flags.format) ?? (json ? "json" : "text")) as CreditsFormat;
      if (!CREDITS_FORMATS.includes(format)) fail(`--format must be one of ${CREDITS_FORMATS.join(", ")}, got "${format}".`);
      credits(rest[0] ?? settings.download?.dir, format);
      return;
    }

    case "open": {
      const ref = rest[0];
      if (!ref) fail("open needs a photo id.");
      const { provider: pName, id } = parsePhotoRef(ref, providerName);
      const photo = await getProvider({ name: pName, settings }).get(id);
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

    case "config":
    case "settings": {
      const sub = rest[0];
      const scope: Scope = bool(flags.global, false) ? "global" : bool(flags.local, false) ? "project" : sub === "init" ? "project" : "global";
      if (sub === undefined || sub === "show" || sub === "list") { configShow(); return; }
      if (sub === "paths" || sub === "path") { configPaths(); return; }
      if (sub === "init") { configInit(scope, bool(flags.force, false)); return; }
      if (sub === "get") {
        if (!rest[1]) fail("config get needs a key.", "example: fabpix config get download.dir");
        configGet(rest[1]);
        return;
      }
      if (sub === "set" || sub === "unset") {
        if (!rest[1]) fail(`config ${sub} needs a key.`, "example: fabpix config set download.dir ./assets --local");
        if (sub === "set" && rest[2] === undefined) fail("config set needs a value.", "to remove a key use: fabpix config unset <key>");
        configSet(rest[1], sub === "set" ? rest[2] : undefined, scope);
        return;
      }
      fail(`unknown config subcommand "${sub}".`, "use: fabpix config [show|paths|init|get|set|unset]");
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

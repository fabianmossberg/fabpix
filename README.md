# fabpix

Search, preview and download stock photos from [Pexels](https://www.pexels.com) and [Unsplash](https://unsplash.com) without leaving your terminal.
Thumbnails render inline in iTerm2, WezTerm, kitty and Ghostty.

```
$ fabpix search "mountain lake" --orientation landscape -n 3
```

Results show as a grid of thumbnails that fills your terminal. Press space for the next page, ← to go back, q to stop. The next page is prefetched while you look.

Built for speed: zero runtime dependencies, parallel thumbnail fetches that stream to the screen as they land, and a disk cache so repeat queries finish in ~20 ms.

## Install

```sh
# Homebrew (prebuilt binary, fastest startup)
brew install fabianmossberg/tap/fabpix

# npm (runs on Node ≥ 20) — the command is still `fabpix`
npm install -g @fabianmossberg/fabpix

# or try it without installing
npx @fabianmossberg/fabpix search cats
```

## Setup: API keys

fabpix talks to each photo service with your own free API key. Keys are stored in
`~/.config/fabpix/config.json` (mode 600) by `fabpix auth set`, or read from environment variables.
Check what's configured and whether the keys work with `fabpix auth status`.

### Pexels (default provider)

1. Sign in or create an account at <https://www.pexels.com>.
2. Open <https://www.pexels.com/api/> and click **Get Started**, then **Your API Key**.
   Pexels asks for a short description of what you'll build; "personal CLI for finding photos" is fine.
3. Copy the key and store it:

```sh
fabpix auth set <key>                # or: export PEXELS_API_KEY=<key>
```

Limits: 200 requests per hour, 20 000 per month. Attribution is appreciated, not required.

### Unsplash

Unsplash keys belong to an "application" you register, even if the application is just you.

1. Sign in at <https://unsplash.com/developers> and click **Your apps**, then **New Application**.
2. Accept the API guidelines checklist (attribution, download tracking, no re-hosting; fabpix does all three).
3. Name it, e.g. "fabpix", and describe it, e.g. "Terminal CLI for finding photos". The name may not contain "Unsplash".
4. On the app page, scroll to **Keys** and copy the **Access Key**. The Secret Key is for OAuth login,
   which fabpix doesn't use, so keep it to yourself.

```sh
fabpix auth set <access-key> --provider unsplash    # or: export UNSPLASH_ACCESS_KEY=<access-key>
```

Limits: 50 requests per hour for a new ("demo") app. Every listing page, `show`, and download counts;
thumbnails and the image files themselves come from the CDN and do not. fabpix caches API responses
for ten minutes, so paging back or repeating a search is free. The app page has an **Apply for production**
button for 5 000 per hour. Attribution is required by Unsplash's API guidelines; fabpix's links carry the
required parameters and `fabpix credits` flags these photos.

### Choosing providers

```sh
fabpix search cats                     # default provider (pexels, or "provider" in your settings)
fabpix search cats -P unsplash         # one provider
fabpix search cats -P all              # every configured provider, results interleaved
fabpix search cats -P pexels,unsplash  # an explicit set
```

In settings, `"provider"` accepts a name, a list, or `"all"`. When searching several providers, the
per-page budget is split evenly, page N is page N of each provider, and ids are shown with their
provider prefix. If one provider fails (no key, rate limit) you get a warning and the others' results.

## Usage

```
fabpix search <query…>        Search photos
fabpix curated                Browse curated / trending photos
fabpix show <id>              Larger preview + full metadata for one photo
fabpix download <id…>         Save photo(s) to disk
fabpix open <id>              Open the photo's web page in your browser
fabpix auth set <key>         Store an API key
fabpix auth status            Check which key is in use and whether it works
fabpix cache clear            Remove cached API responses and thumbnails
```

Common options:

| Flag | Meaning |
|---|---|
| `-n, --per-page <n>` | Results per page (default: fills the screen; max 80) |
| `-p, --page <n>` | Page number |
| `--orientation <o>` | `landscape`, `portrait` or `square` |
| `--color <c>` | Colour filter, e.g. `red` or `#ff0000` |
| `--size <s>` | search: minimum size (`large`/`medium`/`small`). download: `max` or a provider size name, see Sizes |
| `-o, --out <path>` | download: directory or file path |
| `-f, --force` | download: overwrite existing files |
| `--open` | download: open the file afterwards |
| `--metadata <m>` | download: `manifest` (default), `sidecar`, `both`, `none` |
| `--format <f>` | credits: `text` (default), `markdown`, `json` |
| `--layout grid\|list` | Grid (default when images render) or one photo per row with full metadata |
| `--rows <n>` / `--cols <n>` | Thumbnail box size in terminal cells |
| `--no-pager` | Print one page and exit instead of waiting for a key |
| `--no-preview` | Text only |
| `--json` | Machine-readable output |
| `-P, --provider <name>` | `pexels`, `unsplash`, `all`, or a comma-separated list |

Examples:

```sh
fabpix search "coffee shop" --orientation portrait -n 5
fabpix show 1054666
fabpix download 1054666 --size large2x -o ~/Pictures
fabpix download 1054666 2014422 -o ./assets/ --force
fabpix search cats --json | jq -r '.photos[].pageUrl'
```

Every downloaded file is named `<provider>-<id>-<photographer>-<size>.jpg`, so attribution survives.

### Photo ids

Ids can carry a provider prefix: `pexels:1054666`, `unsplash:KiRlN3jjVNU`. That form is always
unambiguous and is what listings print when several providers are shown together, and what the
manifest uses as its key.

A bare id is matched against each provider's id shape: Pexels ids are all digits, Unsplash ids are
eleven characters of letters, digits, `_` and `-`. If exactly one provider matches, it's used; if
several match (an eleven-digit number fits both), the default provider wins; if none match, fabpix
asks for a prefix.

### Sizes

`--size` and the `download.size` setting accept `max`, which means the largest variant the provider
offers, plus each provider's own size names. The Pexels-style names also work on Unsplash so one
settings file can serve both.

| Name | Pexels | Unsplash |
|---|---|---|
| `max` | `original` | `full` (same pixels as `raw`, as a ~3 MB JPEG; `raw` is the untouched upload, often 20 MB+) |
| `original` | original upload | `full` |
| `large2x` | 1880 px wide | 1880 px wide |
| `large` | 940 px wide | `regular`, 1080 px wide |
| `medium` | 350 px tall | `small`, 400 px wide |
| `small` | 130 px tall | `thumb`, 200 px wide |
| Unsplash-only | | `raw`, `full`, `regular`, `small`, `thumb` |

## Credits and metadata

Downloaded images carry no photographer information inside the file (Pexels originals have only a
minimal EXIF block), so fabpix records it for you. By default each download folder gets a
`fabpix.manifest.json` with the full record for every photo: photographer and profile link, page URL,
alt text, dimensions, average colour, license, and which files were downloaded at which size.
Paths in the manifest are relative to the folder, so it is safe to commit.

```sh
fabpix credits ./assets/photos               # attribution list, grouped by photographer
fabpix credits ./assets/photos --format markdown >> CREDITS.md
fabpix credits --json | jq '.photos[] | {photographer, files}'
```

Control what gets written with `--metadata` or the `download.metadata` setting:

| Mode | Writes |
|---|---|
| `manifest` (default) | One `fabpix.manifest.json` per folder |
| `sidecar` | One `<image>.json` next to each image |
| `both` | Both of the above |
| `none` | Just the image |

The manifest is the contract for build-time tooling: a Vite or Svelte plugin can import it to resolve
`provider:id` to a local file and its credit line, or render a thank-you page from `photos`.

## Terminal previews

| Terminal | How |
|---|---|
| iTerm2, WezTerm | Native inline images (same protocol as `imgcat`) |
| kitty, Ghostty | Native kitty graphics protocol (PNG thumbnails) |
| Anything else | `chafa` ANSI art if installed, otherwise a colour swatch |

Inside **tmux**, add `set -g allow-passthrough on` to `~/.tmux.conf`.
Force a protocol with `FABPIX_PROTOCOL=iterm|kitty|chafa|none`.
Previews are skipped automatically when stdout is not a TTY.

## Settings

fabpix reads settings from two places, like git:

| Scope | Where |
|---|---|
| Global | `~/.config/fabpix/config.json` (respects `XDG_CONFIG_HOME`), or `~/.fabpixrc` |
| Project | The nearest `.fabpixrc`, `.fabpixrc.json`, `fabpix.json`, or a `"fabpix"` key in `package.json`, searched upward from the current folder |

Project settings override global ones key by key. Command-line flags override both.
A relative `download.dir` resolves against the folder that holds the settings file, so it works from anywhere inside the project.

```sh
fabpix config init                      # write a starter .fabpixrc in the current folder
fabpix config init --global             # …or the global file
fabpix config set download.dir ./assets/photos --local
fabpix config set preview.layout list   # global by default
fabpix config get download.dir
fabpix config                           # effective settings and which files were read
fabpix config paths                     # which files are consulted
```

All keys, every one optional:

```json
{
  "provider": "pexels",                       // or ["pexels", "unsplash"], or "all"
  "providers": { "pexels": { "apiKey": "…" }, "unsplash": { "apiKey": "…" } },
  "preview": {
    "enabled": true,
    "layout": "grid",
    "protocol": "iterm",
    "rows": 8, "cols": 24,
    "showRows": 20, "showCols": 60
  },
  "search": { "perPage": 20, "orientation": "landscape", "size": "large", "locale": "sv-SE", "color": "blue" },
  "download": { "dir": "./assets/photos", "size": "max", "overwrite": false, "metadata": "manifest" },
  "pager": true
}
```

Keep API keys in the global file (`fabpix auth set <key>`), not in a project file you might commit. Environment variables `FABPIX_PEXELS_KEY` / `PEXELS_API_KEY` and `FABPIX_PROTOCOL` beat both files.

Cache lives in `~/.cache/fabpix` (respects `XDG_CACHE_HOME`). API responses are cached for 10 minutes, thumbnails indefinitely.

## Adding a provider

Providers implement the small `Provider` interface in `src/providers/types.ts` and are registered in `src/providers/index.ts`. Photo ids can be prefixed to target a provider explicitly, e.g. `fabpix show unsplash:abc123`, and each provider declares an id pattern so bare ids can be resolved. Pexels is the default; Unsplash is the second one and a good template for adding more.

## Development

The repo is a Bun workspace:

| Package | npm name | What |
|---|---|---|
| `packages/core` | `@fabianmossberg/fabpix-core` | Providers, settings, manifest. Shared with build-time tooling |
| `packages/cli` | `@fabianmossberg/fabpix` | The `fabpix` command; bundles core, ships as npm package and Homebrew binary |

```sh
bun install
bun run dev search cats        # run the CLI from source (loads .env automatically)
bun test                       # all packages
bun run typecheck
bun run build                  # packages/*/dist
bun run compile                # packages/cli/bin/fabpix — single native binary
```

Releases are automatic: release-please turns conventional commits on master into a release PR; merging it tags the version, builds binaries for macOS/Linux, publishes to npm and updates the Homebrew tap.

## License

MIT

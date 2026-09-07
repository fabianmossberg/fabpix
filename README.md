# fabpix

Search, preview and download stock photos from [Pexels](https://www.pexels.com) without leaving your terminal.
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

# npm (runs on Node ≥ 20)
npm install -g fabpix

# or try it without installing
npx fabpix search cats
```

## Setup

Get a free API key at <https://www.pexels.com/api/>, then either store it:

```sh
fabpix auth set <your-key>        # saved to ~/.config/fabpix/config.json (mode 600)
```

or export it in your shell:

```sh
export PEXELS_API_KEY=<your-key>  # FABPIX_PEXELS_KEY also works and takes precedence
```

Check it with `fabpix auth status`.

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
| `--size <s>` | search: minimum size (`large`/`medium`/`small`). download: variant (`original`, `large2x`, `large`, `medium`, `small`, …) |
| `-o, --out <path>` | download: directory or file path |
| `-f, --force` | download: overwrite existing files |
| `--open` | download: open the file afterwards |
| `--layout grid\|list` | Grid (default when images render) or one photo per row with full metadata |
| `--rows <n>` / `--cols <n>` | Thumbnail box size in terminal cells |
| `--no-pager` | Print one page and exit instead of waiting for a key |
| `--no-preview` | Text only |
| `--json` | Machine-readable output |
| `-P, --provider <name>` | Photo provider (default `pexels`) |

Examples:

```sh
fabpix search "coffee shop" --orientation portrait -n 5
fabpix show 1054666
fabpix download 1054666 --size large2x -o ~/Pictures
fabpix download 1054666 2014422 -o ./assets/ --force
fabpix search cats --json | jq -r '.photos[].pageUrl'
```

Every downloaded file is named `pexels-<id>-<photographer>-<size>.jpg`, so attribution survives.

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
  "provider": "pexels",
  "providers": { "pexels": { "apiKey": "…" } },
  "preview": {
    "enabled": true,
    "layout": "grid",
    "protocol": "iterm",
    "rows": 8, "cols": 24,
    "showRows": 20, "showCols": 60
  },
  "search": { "perPage": 20, "orientation": "landscape", "size": "large", "locale": "sv-SE", "color": "blue" },
  "download": { "dir": "./assets/photos", "size": "large2x", "overwrite": false },
  "pager": true
}
```

Keep API keys in the global file (`fabpix auth set <key>`), not in a project file you might commit. Environment variables `FABPIX_PEXELS_KEY` / `PEXELS_API_KEY` and `FABPIX_PROTOCOL` beat both files.

Cache lives in `~/.cache/fabpix` (respects `XDG_CACHE_HOME`). API responses are cached for 10 minutes, thumbnails indefinitely.

## Adding a provider

Providers implement the small `Provider` interface in `src/providers/types.ts` and are registered in `src/providers/index.ts`. Photo ids can be prefixed to target a provider explicitly, e.g. `fabpix show unsplash:abc123`. Pexels is the default and currently the only one.

## Development

```sh
bun install
bun run dev search cats        # run from source (loads .env automatically)
bun test
bun run typecheck
bun run build                  # dist/fabpix.js  — the npm package (Node target)
bun run compile                # bin/fabpix      — single native binary
```

Releases are cut by pushing a `v*` tag; GitHub Actions builds binaries for macOS/Linux, publishes to npm and updates the Homebrew tap.

## License

MIT

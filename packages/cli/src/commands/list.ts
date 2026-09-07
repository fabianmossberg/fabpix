import type { Photo, PhotoPage } from "@fabianmossberg/fabpix-core";
import { chafaLines, nativeImageSequence, renderBlock } from "../render/preview.ts";
import { renderGridRow, tilesPerRow, type GridTile } from "../render/grid.ts";
import { detectProtocol, insideTmux, terminalColumns, terminalRows, type ImageProtocol } from "../render/terminal.ts";
import { bold, dim, cyan } from "../render/style.ts";
import { photoLines, formatNumber, truncateWidth } from "../format.ts";
import { pagerAvailable, waitForKey } from "../pager.ts";
import { fetchBytes } from "@fabianmossberg/fabpix-core";

export type Layout = "grid" | "list";

export interface ListOptions {
  preview: boolean;
  json: boolean;
  rows: number;
  cols: number;
  layout?: Layout;
  /** Explicit page size; when undefined the page is sized to fill the terminal. */
  perPage?: number;
  pager: boolean;
  /** Show ids as provider:id (used when several providers are listed together). */
  prefixIds?: boolean;
  startPage: number;
  /** Shown above the results, e.g. `pexels · "cats"`. */
  title: string;
  /** Builds the shell command that reproduces page `n` (shown when quitting). */
  commandFor: (page: number) => string;
}

const GAP = 2;
const CAPTION_ROWS = 2;
const CHROME_ROWS = 3; // header + blank + prompt/footer

const write = (s: string) => process.stdout.write(s);

interface LoadedPage {
  page: PhotoPage;
  thumbs: Promise<Uint8Array | undefined>[];
}

export function resolveLayout(requested: Layout | undefined, protocol: ImageProtocol): Layout {
  if (requested) return requested;
  return protocol === "none" ? "list" : "grid";
}

/** Page size that fills the terminal for the given layout, capped at the API max. */
export function fittedPageSize(layout: Layout, box: { rows: number; cols: number }, term: { rows: number; cols: number }, max = 80): number {
  const usable = Math.max(1, term.rows - CHROME_ROWS);
  if (layout === "grid") {
    const perRow = tilesPerRow(term.cols, { ...box, gap: GAP, captionRows: CAPTION_ROWS });
    const gridRows = Math.max(1, Math.floor(usable / (box.rows + CAPTION_ROWS + 1)));
    return Math.min(max, perRow * gridRows);
  }
  return Math.min(max, Math.max(1, Math.floor(usable / (box.rows + 1))));
}

/** Pick the thumbnail URL for a protocol: kitty needs PNG, everything else prefers the smaller JPEG. */
export function thumbUrlFor(p: Photo, protocol: ImageProtocol): string {
  return protocol === "kitty" && p.thumbPngUrl ? p.thumbPngUrl : p.thumbUrl;
}

function loadThumbs(page: PhotoPage, protocol: ImageProtocol): Promise<Uint8Array | undefined>[] {
  return page.photos.map((p) =>
    protocol !== "none" ? fetchBytes(thumbUrlFor(p, protocol)).catch(() => undefined) : Promise.resolve(undefined),
  );
}

function caption(p: Photo, index: number, width: number, prefix: boolean): string[] {
  const num = `#${index + 1} `;
  const id = prefix ? `${p.provider}:${p.id}` : p.id;
  return [
    dim(num) + bold(truncateWidth(p.photographer, Math.max(4, width - num.length))),
    dim("id ") + cyan(truncateWidth(id, Math.max(4, width - 3))),
  ];
}

async function paintGrid(loaded: LoadedPage, opts: ListOptions, protocol: ImageProtocol): Promise<void> {
  const gridOpts = { cols: opts.cols, rows: opts.rows, gap: GAP, captionRows: CAPTION_ROWS };
  const perRow = tilesPerRow(terminalColumns(), gridOpts);
  const tmux = insideTmux();
  const photos = loaded.page.photos;

  for (let start = 0; start < photos.length; start += perRow) {
    const tiles: GridTile[] = [];
    for (let i = start; i < Math.min(start + perRow, photos.length); i++) {
      const photo = photos[i]!;
      const bytes = await loaded.thumbs[i];
      const tile: GridTile = { caption: caption(photo, i, opts.cols, opts.prefixIds ?? false) };
      if (bytes) {
        tile.imageSeq = nativeImageSequence(bytes, gridOpts, protocol, tmux);
        if (!tile.imageSeq) tile.artLines = chafaLines(bytes, gridOpts);
      }
      tiles.push(tile);
    }
    write(renderGridRow(tiles, gridOpts));
  }
}

async function paintList(loaded: LoadedPage, opts: ListOptions, protocol: ImageProtocol): Promise<void> {
  const textWidth = Math.max(20, terminalColumns() - (protocol !== "none" ? opts.cols + 4 : 4));
  for (let i = 0; i < loaded.page.photos.length; i++) {
    const photo = loaded.page.photos[i]!;
    const bytes = await loaded.thumbs[i];
    write(renderBlock(
      { bytes, avgColor: photo.avgColor, lines: photoLines(photo, i, textWidth, opts.prefixIds ?? false) },
      { cols: opts.cols, rows: opts.rows, protocol },
    ));
  }
}

function header(page: PhotoPage, opts: ListOptions): string {
  const totalText = page.total !== undefined ? ` · ${formatNumber(page.total)} results` : "";
  return bold(opts.title) + dim(` · page ${page.page}${totalText}`) + "\n\n";
}

/**
 * Drive a paged listing. Thumbnails for a page are fetched in parallel the
 * moment it arrives and painted in order as each lands. While the user looks
 * at a page, the next page (and its thumbnails) are prefetched so pressing
 * space feels instant.
 */
export async function listPhotos(fetchPage: (page: number, perPage: number) => Promise<PhotoPage>, opts: ListOptions): Promise<void> {
  const protocol = opts.preview && !opts.json ? detectProtocol() : "none";
  const layout = resolveLayout(opts.layout, protocol);
  const perPage = opts.perPage ?? (opts.json || !process.stdout.isTTY
    ? 10
    : fittedPageSize(layout, { rows: opts.rows, cols: opts.cols }, { rows: terminalRows(), cols: terminalColumns() }));

  const cache = new Map<number, Promise<LoadedPage>>();
  const load = (n: number): Promise<LoadedPage> => {
    let p = cache.get(n);
    if (!p) {
      p = fetchPage(n, perPage).then((page) => ({ page, thumbs: loadThumbs(page, protocol) }));
      cache.set(n, p);
    }
    return p;
  };

  const interactive = opts.pager && !opts.json && pagerAvailable();
  let current = opts.startPage;

  for (;;) {
    const loaded = await load(current);
    if (opts.json) {
      write(JSON.stringify(loaded.page, null, 2) + "\n");
      return;
    }
    write(header(loaded.page, opts));
    if (loaded.page.photos.length === 0) {
      write(dim("No photos found.") + "\n");
      return;
    }
    if (layout === "grid") await paintGrid(loaded, opts, protocol);
    else await paintList(loaded, opts, protocol);

    if (!interactive) {
      if (loaded.page.hasNext) write(dim(`Next page:  ${opts.commandFor(current + 1)}`) + "\n");
      return;
    }

    if (loaded.page.hasNext) void load(current + 1); // prefetch, ignore errors here
    const hints = [
      loaded.page.hasNext ? "space next" : "",
      current > 1 ? "← back" : "",
      "q quit",
    ].filter(Boolean).join(dim(" · "));
    write(dim("─ ") + hints + " ");

    let key = await waitForKey();
    if (key === "next" && !loaded.page.hasNext) key = "quit";
    if (key === "prev" && current <= 1) continue;
    write("\r\x1b[2K");
    if (key === "quit") {
      write(dim(`Resume with:  ${opts.commandFor(current)}`) + "\n");
      return;
    }
    current += key === "next" ? 1 : -1;
  }
}

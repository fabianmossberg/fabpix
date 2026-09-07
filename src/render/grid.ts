import type { PreviewBox } from "./preview.ts";

/** One tile in a grid: either a self-positioning escape (iTerm) or pre-rendered ANSI lines (chafa). */
export interface GridTile {
  imageSeq?: string;
  artLines?: string[];
  caption: string[];
}

export interface GridOptions extends PreviewBox {
  /** Blank columns between tiles. */
  gap: number;
  /** Caption lines reserved under each tile. */
  captionRows: number;
}

/** Terminal column (1-based) where tile `i` starts. */
export function tileColumn(i: number, opts: GridOptions): number {
  return 1 + i * (opts.cols + opts.gap);
}

/** How many tiles fit across `terminalCols`. */
export function tilesPerRow(terminalCols: number, opts: GridOptions): number {
  return Math.max(1, Math.floor((terminalCols + opts.gap) / (opts.cols + opts.gap)));
}

/**
 * Render one row of tiles side by side.
 *
 * Same cursor choreography as the list layout, extended horizontally: reserve
 * the vertical space, save the cursor at the row's top-left, then for every
 * tile restore + jump to its column before drawing. Captions are placed the
 * same way, `rows` lines further down. Finally land under the whole row.
 */
export function renderGridRow(tiles: GridTile[], opts: GridOptions): string {
  const height = opts.rows + opts.captionRows;
  let out = "\n".repeat(height + 1) + `\x1b[${height + 1}A` + "\x1b7";

  tiles.forEach((tile, i) => {
    const x = tileColumn(i, opts);
    if (tile.imageSeq) {
      out += "\x1b8" + `\x1b[${x}G` + tile.imageSeq;
    } else if (tile.artLines) {
      tile.artLines.slice(0, opts.rows).forEach((line, r) => {
        out += "\x1b8" + (r > 0 ? `\x1b[${r}B` : "") + `\x1b[${x}G` + line;
      });
    }
    tile.caption.slice(0, opts.captionRows).forEach((line, c) => {
      out += "\x1b8" + `\x1b[${opts.rows + c}B` + `\x1b[${x}G` + line;
    });
  });

  out += "\x1b8" + `\x1b[${height}B\r\n`;
  return out;
}

import type { Photo, PhotoPage } from "../providers/types.ts";
import { fetchBytes } from "../http.ts";
import { renderBlock } from "../render/preview.ts";
import { detectProtocol, terminalColumns } from "../render/terminal.ts";
import { bold, dim } from "../render/style.ts";
import { photoLines, formatNumber } from "../format.ts";

export interface ListRenderOptions {
  preview: boolean;
  json: boolean;
  rows: number;
  cols: number;
  /** Shown above the results, e.g. `Pexels · "cats"`. */
  title: string;
  /** Command to reproduce the next page, shown in the footer. */
  nextCommand?: string;
}

const write = (s: string) => process.stdout.write(s);

/**
 * Print a page of photos. Thumbnails are fetched in parallel the moment the
 * page arrives and printed in order as each one lands, so the first result is
 * on screen while the rest are still downloading.
 */
export async function renderPage(page: PhotoPage, opts: ListRenderOptions): Promise<void> {
  if (opts.json) {
    write(JSON.stringify(page, null, 2) + "\n");
    return;
  }

  const protocol = opts.preview ? detectProtocol() : "none";
  const wantThumbs = protocol !== "none";
  const textWidth = Math.max(20, terminalColumns() - (wantThumbs ? opts.cols + 4 : 4));

  const totalText = page.total !== undefined ? ` · ${formatNumber(page.total)} results` : "";
  write(bold(opts.title) + dim(` · page ${page.page}${totalText}`) + "\n\n");

  if (page.photos.length === 0) {
    write(dim("No photos found.") + "\n");
    return;
  }

  const thumbs: Promise<Uint8Array | undefined>[] = page.photos.map((p: Photo) =>
    wantThumbs ? fetchBytes(p.thumbUrl).catch(() => undefined) : Promise.resolve(undefined),
  );

  for (let i = 0; i < page.photos.length; i++) {
    const photo = page.photos[i]!;
    const bytes = await thumbs[i];
    write(
      renderBlock(
        { bytes, avgColor: photo.avgColor, lines: photoLines(photo, i, textWidth) },
        { cols: opts.cols, rows: opts.rows, protocol },
      ),
    );
  }

  if (page.hasNext && opts.nextCommand) {
    write(dim(`Next page:  ${opts.nextCommand}`) + "\n");
  }
}

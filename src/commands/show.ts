import type { Provider } from "../providers/types.ts";
import { fetchBytes } from "../http.ts";
import { renderBlock } from "../render/preview.ts";
import { detectProtocol, terminalColumns } from "../render/terminal.ts";
import { bold, dim, cyan, link } from "../render/style.ts";
import { orientationOf } from "../format.ts";

export interface ShowOptions {
  id: string;
  preview: boolean;
  json: boolean;
  rows: number;
  cols: number;
}

export async function showPhoto(provider: Provider, opts: ShowOptions): Promise<void> {
  const photo = await provider.get(opts.id);
  if (opts.json) {
    process.stdout.write(JSON.stringify(photo, null, 2) + "\n");
    return;
  }
  const protocol = opts.preview ? detectProtocol() : "none";
  const previewUrl = protocol === "kitty" && photo.previewPngUrl ? photo.previewPngUrl : photo.previewUrl;
  const bytes = protocol !== "none" ? await fetchBytes(previewUrl).catch(() => undefined) : undefined;

  const width = Math.max(20, terminalColumns() - opts.cols - 4);
  const lines = [
    bold(photo.photographer) + (photo.photographerUrl ? dim("  " + link(photo.photographerUrl)) : ""),
    dim(`${photo.width} × ${photo.height} · ${orientationOf(photo)}` + (photo.avgColor ? ` · ${photo.avgColor}` : "")),
    `id ${cyan(`${photo.provider}:${photo.id}`)}`,
    dim(link(photo.pageUrl)),
    ...(photo.alt ? ["", photo.alt.slice(0, width)] : []),
    "",
    dim("sizes: ") + Object.keys(photo.sizes).join(dim(" · ")),
    "",
    dim(`download:  fabpix download ${photo.id} --size large2x`),
  ];
  process.stdout.write(
    renderBlock({ bytes, avgColor: photo.avgColor, lines }, { cols: opts.cols, rows: opts.rows, protocol }),
  );
}

import type { Photo } from "./providers/types.ts";
import { bold, dim, cyan, link } from "./render/style.ts";

export function orientationOf(p: Photo): "landscape" | "portrait" | "square" {
  if (p.width === p.height) return "square";
  return p.width > p.height ? "landscape" : "portrait";
}

/** Approximate display width: East Asian wide / fullwidth code points count as 2. */
export function charWidth(cp: number): number {
  if (cp < 0x1100) return 1;
  if (
    (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x20000 && cp <= 0x3fffd)
  ) return 2;
  return 1;
}

export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += charWidth(ch.codePointAt(0)!);
  return w;
}

/** Truncate to a display width (not a code-point count), so CJK names don't overflow grid tiles. */
export function truncateWidth(s: string, max: number): string {
  if (displayWidth(s) <= max) return s;
  let out = "", w = 0;
  for (const ch of s) {
    const cw = charWidth(ch.codePointAt(0)!);
    if (w + cw > max - 1) break;
    out += ch;
    w += cw;
  }
  return out.trimEnd() + "…";
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + "…";
}

/** Metadata lines shown next to a thumbnail in list views. */
export function photoLines(p: Photo, index: number | undefined, maxWidth: number, prefixId = false): string[] {
  const head = (index !== undefined ? dim(`#${index + 1} `) : "") + bold(truncate(p.photographer, maxWidth - 4));
  const geometry = `${p.width} × ${p.height} · ${orientationOf(p)}` + (p.avgColor ? ` · ${p.avgColor}` : "");
  const id = `id ${cyan(prefixId ? `${p.provider}:${p.id}` : p.id)}`;
  const lines = [head, dim(geometry), id, dim(link(p.pageUrl, truncate(p.pageUrl, maxWidth)))];
  if (p.alt) lines.push(dim(truncate(p.alt, maxWidth)));
  return lines;
}

export function photoRef(p: Photo): string {
  return `${p.provider}:${p.id}`;
}

export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "photo";
}

export function extensionFromUrl(url: string, fallback = ".jpg"): string {
  try {
    const path = new URL(url).pathname;
    const m = /\.(jpe?g|png|webp|gif|avif)$/i.exec(path);
    return m ? "." + m[1]!.toLowerCase().replace("jpeg", "jpg") : fallback;
  } catch {
    return fallback;
  }
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

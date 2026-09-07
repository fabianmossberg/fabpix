import type { Photo } from "./providers/types.ts";
import { bold, dim, cyan, link } from "./render/style.ts";

export function orientationOf(p: Photo): "landscape" | "portrait" | "square" {
  if (p.width === p.height) return "square";
  return p.width > p.height ? "landscape" : "portrait";
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + "…";
}

/** Metadata lines shown next to a thumbnail in list views. */
export function photoLines(p: Photo, index: number | undefined, maxWidth: number): string[] {
  const head = (index !== undefined ? dim(`#${index + 1} `) : "") + bold(truncate(p.photographer, maxWidth - 4));
  const geometry = `${p.width} × ${p.height} · ${orientationOf(p)}` + (p.avgColor ? ` · ${p.avgColor}` : "");
  const id = `id ${cyan(p.provider === "pexels" ? p.id : `${p.provider}:${p.id}`)}`;
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

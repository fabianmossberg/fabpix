import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { manifestPath, readManifest, type ManifestEntry } from "../manifest.ts";
import { ProviderError } from "../providers/types.ts";
import { bold, dim, link } from "../render/style.ts";

export type CreditsFormat = "text" | "markdown" | "json";
export const CREDITS_FORMATS: readonly CreditsFormat[] = ["text", "markdown", "json"];

export interface Credit {
  photographer: string;
  photographerUrl?: string;
  provider: string;
  photos: { id: string; pageUrl: string; alt?: string; files: string[] }[];
}

/** Group manifest entries by photographer (per provider), sorted by name. */
export function groupCredits(entries: ManifestEntry[]): Credit[] {
  const map = new Map<string, Credit>();
  for (const e of entries) {
    const key = `${e.provider} ${e.photographer}`;
    let c = map.get(key);
    if (!c) {
      c = { photographer: e.photographer, photographerUrl: e.photographerUrl, provider: e.provider, photos: [] };
      map.set(key, c);
    }
    c.photos.push({ id: e.id, pageUrl: e.pageUrl, alt: e.alt, files: e.files.map((f) => f.path) });
  }
  return [...map.values()].sort((a, b) => a.photographer.localeCompare(b.photographer));
}

const providerName = (p: string) => p.charAt(0).toUpperCase() + p.slice(1);

export function formatCredits(credits: Credit[], entries: ManifestEntry[], format: CreditsFormat): string {
  if (format === "json") return JSON.stringify({ credits, photos: entries }, null, 2) + "\n";

  const licenses = new Map<string, ManifestEntry["license"]>();
  for (const e of entries) licenses.set(e.provider, e.license);

  if (format === "markdown") {
    const lines = credits.map((c) => {
      const who = c.photographerUrl ? `[${c.photographer}](${c.photographerUrl})` : c.photographer;
      const links = c.photos
        .map((p, i) => `[${c.photos.length > 1 ? `photo ${i + 1}` : "photo"}](${p.pageUrl})`)
        .join(", ");
      return `- ${who} via ${providerName(c.provider)} (${links})`;
    });
    const lic = [...licenses].map(
      ([p, l]) => `_${providerName(p)}: [${l.name}](${l.url})${l.attributionRequired ? " (attribution required)" : ""}_`,
    );
    return ["## Photo credits", "", ...lines, "", ...lic].join("\n") + "\n";
  }

  const lines = credits.map((c) => {
    const count = c.photos.length > 1 ? dim(` (${c.photos.length} photos)`) : "";
    return `  ${bold(c.photographer)}${count}  ${dim(c.photographerUrl ? link(c.photographerUrl) : providerName(c.provider))}`;
  });
  const lic = [...licenses].map(([p, l]) =>
    dim(`${providerName(p)}: ${l.name} ${link(l.url)}${l.attributionRequired ? " (attribution required)" : ""}`),
  );
  return [bold("Photos by"), ...lines, "", ...lic].join("\n") + "\n";
}

export function credits(dir: string | undefined, format: CreditsFormat): void {
  const target = resolve(dir ?? process.cwd());
  if (!existsSync(manifestPath(target))) {
    throw new ProviderError(
      `No ${manifestPath(target)} found.`,
      "Download something first, or pass the folder: fabpix credits ./assets/photos",
    );
  }
  const manifest = readManifest(target);
  const entries = Object.values(manifest.photos);
  process.stdout.write(formatCredits(groupCredits(entries), entries, format));
}

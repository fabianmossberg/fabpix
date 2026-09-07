import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, basename, dirname } from "node:path";
import type { Provider, Photo } from "../providers/types.ts";
import { ProviderError } from "../providers/types.ts";
import { fetchBytes } from "../http.ts";
import { extensionFromUrl, slugify } from "../format.ts";
import { dim, green } from "../render/style.ts";
import { readManifest, relativeTo, upsert, writeManifest, writeSidecar, type MetadataMode } from "../manifest.ts";

export interface DownloadOptions {
  ids: string[];
  size?: string;
  /** Output directory, or an explicit file path when downloading a single photo. */
  out?: string;
  force: boolean;
  quiet: boolean;
  /** Where to record photographer/license metadata. */
  metadata: MetadataMode;
}

interface Saved {
  photo: Photo;
  file: string;
  size: string;
  bytes: number;
  /** false when the file already existed and was left alone. */
  fresh: boolean;
}

export async function downloadPhotos(provider: Provider, opts: DownloadOptions): Promise<string[]> {
  const size = opts.size ?? provider.defaultSize;
  if (!provider.sizeNames.includes(size)) {
    throw new ProviderError(`Unknown size "${size}" for ${provider.name}.`, `Available: ${provider.sizeNames.join(", ")}`);
  }

  const out = opts.out ? resolve(opts.out) : process.cwd();
  const outIsFile =
    opts.ids.length === 1 && opts.out !== undefined && !opts.out.endsWith("/") &&
    /\.[a-z0-9]{2,5}$/i.test(basename(opts.out)) && !(existsSync(out) && statSync(out).isDirectory());

  const photos = await Promise.all(opts.ids.map((id) => provider.get(id)));

  const saved = await Promise.all(
    photos.map(async (photo): Promise<Saved> => {
      const url = photo.sizes[size];
      if (!url) throw new ProviderError(`Photo ${photo.id} has no "${size}" variant.`);
      const file = outIsFile
        ? out
        : join(out, `${photo.provider}-${photo.id}-${slugify(photo.photographer)}-${size}${extensionFromUrl(url)}`);
      if (existsSync(file) && !opts.force) {
        if (!opts.quiet) process.stdout.write(dim(`skip  ${file} (exists, use --force)`) + "\n");
        return { photo, file, size, bytes: statSync(file).size, fresh: false };
      }
      const bytes = await fetchBytes(url, { cache: false });
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, bytes);
      if (!opts.quiet) {
        process.stdout.write(green("saved ") + file + dim(`  (${(bytes.byteLength / 1024).toFixed(0)} KB, ${photo.width}×${photo.height} @ ${size})`) + "\n");
      }
      return { photo, file, size, bytes: bytes.byteLength, fresh: true };
    }),
  );

  // Providers like Unsplash require a "download happened" ping per photo. Best effort, never blocks.
  if (provider.trackDownload) {
    await Promise.all(saved.filter((s) => s.fresh).map((s) => provider.trackDownload!(s.photo).catch(() => undefined)));
  }

  recordMetadata(saved, opts);
  return saved.map((s) => s.file);
}

/**
 * Metadata is written after all downloads finish, once per folder, so
 * parallel downloads never race on the same manifest file. Skipped files
 * are still (re)recorded, so a lost manifest can be rebuilt with --force-less re-runs.
 */
function recordMetadata(saved: Saved[], opts: DownloadOptions): void {
  if (opts.metadata === "none" || saved.length === 0) return;
  const wantManifest = opts.metadata === "manifest" || opts.metadata === "both";
  const wantSidecar = opts.metadata === "sidecar" || opts.metadata === "both";

  const byDir = new Map<string, Saved[]>();
  for (const s of saved) byDir.set(dirname(s.file), [...(byDir.get(dirname(s.file)) ?? []), s]);

  for (const [dir, items] of byDir) {
    if (wantManifest) {
      const manifest = readManifest(dir);
      for (const s of items) upsert(manifest, s.photo, { path: relativeTo(dir, s.file), size: s.size, bytes: s.bytes });
      const path = writeManifest(dir, manifest);
      if (!opts.quiet) process.stdout.write(dim(`meta  ${path} (${Object.keys(manifest.photos).length} photos)`) + "\n");
    }
    if (wantSidecar) {
      for (const s of items) {
        const path = writeSidecar(s.file, s.photo, { size: s.size, bytes: s.bytes, downloadedAt: new Date().toISOString() });
        if (!opts.quiet) process.stdout.write(dim(`meta  ${path}`) + "\n");
      }
    }
  }
}

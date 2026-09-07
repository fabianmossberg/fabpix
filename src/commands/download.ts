import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import type { Provider } from "../providers/types.ts";
import { ProviderError } from "../providers/types.ts";
import { fetchBytes } from "../http.ts";
import { extensionFromUrl, slugify } from "../format.ts";
import { dim, green } from "../render/style.ts";

export interface DownloadOptions {
  ids: string[];
  size?: string;
  /** Output directory, or an explicit file path when downloading a single photo. */
  out?: string;
  force: boolean;
  quiet: boolean;
}

export async function downloadPhotos(provider: Provider, opts: DownloadOptions): Promise<string[]> {
  const size = opts.size ?? provider.defaultSize;
  if (!provider.sizeNames.includes(size)) {
    throw new ProviderError(`Unknown size "${size}" for ${provider.name}.`, `Available: ${provider.sizeNames.join(", ")}`);
  }

  const out = opts.out ? resolve(opts.out) : process.cwd();
  const outIsFile = opts.ids.length === 1 && opts.out !== undefined && !opts.out.endsWith("/") && /\.[a-z0-9]{2,5}$/i.test(basename(opts.out)) && !(existsSync(out) && statSync(out).isDirectory());

  const photos = await Promise.all(opts.ids.map((id) => provider.get(id)));
  const written: string[] = [];

  await Promise.all(
    photos.map(async (photo) => {
      const url = photo.sizes[size];
      if (!url) throw new ProviderError(`Photo ${photo.id} has no "${size}" variant.`);
      const file = outIsFile
        ? out
        : join(out, `${photo.provider}-${photo.id}-${slugify(photo.photographer)}-${size}${extensionFromUrl(url)}`);
      if (existsSync(file) && !opts.force) {
        if (!opts.quiet) process.stdout.write(dim(`skip  ${file} (exists, use --force)`) + "\n");
        written.push(file);
        return;
      }
      const bytes = await fetchBytes(url, { cache: false });
      mkdirSync(outIsFile ? resolve(out, "..") : out, { recursive: true });
      writeFileSync(file, bytes);
      written.push(file);
      if (!opts.quiet) {
        process.stdout.write(green("saved ") + file + dim(`  (${(bytes.byteLength / 1024).toFixed(0)} KB, ${photo.width}×${photo.height} @ ${size})`) + "\n");
      }
    }),
  );
  return written;
}

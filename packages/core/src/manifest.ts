import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import type { Photo } from "./providers/types.ts";

export const MANIFEST_NAME = "fabpix.manifest.json";
export type MetadataMode = "manifest" | "sidecar" | "both" | "none";
export const METADATA_MODES: readonly MetadataMode[] = ["manifest", "sidecar", "both", "none"];

export interface ManifestFile {
  /** Relative to the manifest's folder. */
  path: string;
  size: string;
  bytes: number;
  downloadedAt: string;
}

/** One photo as recorded on disk: the provider-neutral record plus what was downloaded. */
export interface ManifestEntry extends Photo {
  files: ManifestFile[];
}

export interface Manifest {
  version: 1;
  photos: Record<string, ManifestEntry>;
}

export function photoKey(p: Pick<Photo, "provider" | "id">): string {
  return `${p.provider}:${p.id}`;
}

export function manifestPath(dir: string): string {
  return join(dir, MANIFEST_NAME);
}

export function readManifest(dir: string): Manifest {
  const path = manifestPath(dir);
  if (!existsSync(path)) return { version: 1, photos: {} };
  const data = JSON.parse(readFileSync(path, "utf8")) as Partial<Manifest>;
  if (data.version !== 1 || typeof data.photos !== "object" || data.photos === null) {
    throw new Error(`${path} is not a fabpix manifest (expected version 1).`);
  }
  return { version: 1, photos: data.photos };
}

/** Write atomically so a crash mid-write can't leave a truncated manifest. */
export function writeManifest(dir: string, manifest: Manifest): string {
  const path = manifestPath(dir);
  const tmp = join(dir, `.${MANIFEST_NAME}.${process.pid}.tmp`);
  writeFileSync(tmp, JSON.stringify(sorted(manifest), null, 2) + "\n");
  renameSync(tmp, path);
  return path;
}

function sorted(m: Manifest): Manifest {
  const photos: Record<string, ManifestEntry> = {};
  for (const key of Object.keys(m.photos).sort()) photos[key] = m.photos[key]!;
  return { version: 1, photos };
}

/**
 * Merge a downloaded file into the manifest. Re-downloading the same size
 * replaces that file entry instead of appending a duplicate; the photo
 * record itself is refreshed from the latest API response.
 */
export function upsert(manifest: Manifest, photo: Photo, file: { path: string; size: string; bytes: number; at?: Date }): Manifest {
  const key = photoKey(photo);
  const existing = manifest.photos[key];
  const entry: ManifestFile = {
    path: file.path,
    size: file.size,
    bytes: file.bytes,
    downloadedAt: (file.at ?? new Date()).toISOString(),
  };
  const files = (existing?.files ?? []).filter((f) => f.path !== entry.path && f.size !== entry.size);
  files.push(entry);
  files.sort((a, b) => a.path.localeCompare(b.path));
  manifest.photos[key] = { ...photo, files };
  return manifest;
}

/** Path of the sidecar JSON for an image file: photo.jpg → photo.json */
export function sidecarPath(imagePath: string): string {
  return imagePath.replace(/\.[a-z0-9]+$/i, "") + ".json";
}

export function writeSidecar(imagePath: string, photo: Photo, file: Omit<ManifestFile, "path">): string {
  const path = sidecarPath(imagePath);
  const record = { ...photo, file: { path: basename(imagePath), ...file } };
  writeFileSync(path, JSON.stringify(record, null, 2) + "\n");
  return path;
}

export function relativeTo(dir: string, filePath: string): string {
  return relative(dir, filePath).split("\\").join("/");
}

export { dirname };

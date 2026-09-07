import { readFileSync, writeFileSync, mkdirSync, statSync, rmSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

export function cacheDir(): string {
  const xdg = process.env.XDG_CACHE_HOME;
  return join(xdg && xdg.length > 0 ? xdg : join(homedir(), ".cache"), "fabpix");
}

function keyPath(namespace: string, key: string, ext: string): string {
  const hash = createHash("sha1").update(key).digest("hex");
  return join(cacheDir(), namespace, hash + ext);
}

export function getJson<T>(namespace: string, key: string, ttlMs: number): T | undefined {
  const path = keyPath(namespace, key, ".json");
  try {
    const age = Date.now() - statSync(path).mtimeMs;
    if (age > ttlMs) return undefined;
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

export function setJson(namespace: string, key: string, value: unknown): void {
  const path = keyPath(namespace, key, ".json");
  mkdirSync(join(cacheDir(), namespace), { recursive: true });
  writeFileSync(path, JSON.stringify(value));
}

export function getBytes(namespace: string, key: string): Uint8Array | undefined {
  try {
    return readFileSync(keyPath(namespace, key, ".bin"));
  } catch {
    return undefined;
  }
}

export function setBytes(namespace: string, key: string, bytes: Uint8Array): void {
  mkdirSync(join(cacheDir(), namespace), { recursive: true });
  writeFileSync(keyPath(namespace, key, ".bin"), bytes);
}

export function clearCache(): boolean {
  const dir = cacheDir();
  if (!existsSync(dir)) return false;
  rmSync(dir, { recursive: true, force: true });
  return true;
}

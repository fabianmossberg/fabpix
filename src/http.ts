import { getBytes, getJson, setBytes, setJson } from "./cache.ts";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly url: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface JsonRequest {
  url: string;
  headers?: Record<string, string>;
  /** Cache TTL in ms. 0 disables caching. */
  ttlMs?: number;
}

const API_NAMESPACE = "api";
const IMG_NAMESPACE = "img";

export async function fetchJson<T>({ url, headers = {}, ttlMs = 0 }: JsonRequest): Promise<T> {
  if (ttlMs > 0) {
    const cached = getJson<T>(API_NAMESPACE, url, ttlMs);
    if (cached !== undefined) return cached;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new HttpError(res.status, body || res.statusText, url);
  }
  const data = (await res.json()) as T;
  if (ttlMs > 0) setJson(API_NAMESPACE, url, data);
  return data;
}

/** Fetch image bytes; thumbnails are content-addressed by URL so they cache forever. */
export async function fetchBytes(url: string, { cache = true } = {}): Promise<Uint8Array> {
  if (cache) {
    const hit = getBytes(IMG_NAMESPACE, url);
    if (hit) return hit;
  }
  const res = await fetch(url);
  if (!res.ok) throw new HttpError(res.status, res.statusText, url);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (cache) setBytes(IMG_NAMESPACE, url, bytes);
  return bytes;
}

import { createPexels } from "./pexels.ts";
import { createUnsplash } from "./unsplash.ts";
import { ProviderError, type Provider, type ProviderFactory } from "./types.ts";
import { loadSettings, resolveApiKey, type Settings } from "../config.ts";

/** Registry of known providers. Add a new provider by adding a line here. */
export const PROVIDERS: Record<string, ProviderFactory> = {
  pexels: createPexels,
  unsplash: createUnsplash,
};

export const DEFAULT_PROVIDER = "pexels";

export function providerNames(): string[] {
  return Object.keys(PROVIDERS);
}

export interface GetProviderOptions {
  name?: string;
  settings?: Settings;
  ttlMs?: number;
}

export function getProvider({ name, settings = loadSettings().settings, ttlMs = 10 * 60_000 }: GetProviderOptions = {}): Provider {
  const resolved = name ?? settings.provider ?? DEFAULT_PROVIDER;
  const factory = PROVIDERS[resolved];
  if (!factory) {
    throw new ProviderError(`Unknown provider "${resolved}".`, `Available: ${providerNames().join(", ")}`);
  }
  return factory({ apiKey: resolveApiKey(resolved, settings), ttlMs });
}

/** Parse "pexels:123" or "123" into { provider, id }. */
export function parsePhotoRef(ref: string, fallbackProvider?: string): { provider: string; id: string } {
  const idx = ref.indexOf(":");
  if (idx > 0) return { provider: ref.slice(0, idx), id: ref.slice(idx + 1) };
  return { provider: fallbackProvider ?? DEFAULT_PROVIDER, id: ref };
}

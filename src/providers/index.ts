import { createPexels } from "./pexels.ts";
import { createUnsplash } from "./unsplash.ts";
import { createMulti } from "./multi.ts";
import { ProviderError, type Provider, type ProviderFactory } from "./types.ts";
import { loadSettings, resolveApiKey, type Settings } from "../config.ts";

export interface ProviderMeta {
  create: ProviderFactory;
  /** What a bare id looks like, so `fabpix show 123` can find its provider without a prefix. */
  idPattern: RegExp;
}

/** Registry of known providers. Add a new provider by adding an entry here. */
export const PROVIDERS: Record<string, ProviderMeta> = {
  pexels: { create: createPexels, idPattern: /^\d+$/ },
  unsplash: { create: createUnsplash, idPattern: /^[A-Za-z0-9_-]{11}$/ },
};

export const DEFAULT_PROVIDER = "pexels";
export const ALL = "all";

export function providerNames(): string[] {
  return Object.keys(PROVIDERS);
}

/**
 * Turn a provider selection into concrete names.
 *   "pexels" → ["pexels"]      "pexels,unsplash" → both      "all" → every registered provider
 * Accepts a string (flag / settings) or an array (settings).
 */
export function selectProviders(selection: string | string[] | undefined): string[] {
  if (selection === undefined) return [DEFAULT_PROVIDER];
  const raw = Array.isArray(selection) ? selection : selection.split(",");
  const names = raw.map((s) => s.trim()).filter(Boolean);
  if (names.includes(ALL)) return providerNames();
  for (const n of names) {
    if (!PROVIDERS[n]) throw new ProviderError(`Unknown provider "${n}".`, `Available: ${providerNames().join(", ")}, or "all"`);
  }
  return [...new Set(names)];
}

export interface GetProviderOptions {
  name?: string;
  settings?: Settings;
  ttlMs?: number;
}

export function getProvider({ name = DEFAULT_PROVIDER, settings = loadSettings().settings, ttlMs = 10 * 60_000 }: GetProviderOptions = {}): Provider {
  const meta = PROVIDERS[name];
  if (!meta) throw new ProviderError(`Unknown provider "${name}".`, `Available: ${providerNames().join(", ")}`);
  return meta.create({ apiKey: resolveApiKey(name, settings), ttlMs });
}

/** One provider, or a composite that searches several at once. */
export function getProviders(names: string[], settings: Settings, ttlMs?: number): Provider {
  const providers = names.map((name) => getProvider({ name, settings, ttlMs }));
  return providers.length === 1 ? providers[0]! : createMulti(providers);
}

export interface PhotoRef {
  provider: string;
  id: string;
}

/**
 * Resolve "pexels:123", "unsplash:abc" or a bare id to a provider.
 * A bare id is matched against every provider's id pattern:
 *   exactly one match → that provider;  several → the first of `preferred`;  none → error.
 */
export function resolvePhotoRef(ref: string, preferred: string[] = [DEFAULT_PROVIDER]): PhotoRef {
  const idx = ref.indexOf(":");
  if (idx > 0) {
    const provider = ref.slice(0, idx);
    if (!PROVIDERS[provider]) throw new ProviderError(`Unknown provider "${provider}" in "${ref}".`, `Available: ${providerNames().join(", ")}`);
    return { provider, id: ref.slice(idx + 1) };
  }
  const matches = providerNames().filter((n) => PROVIDERS[n]!.idPattern.test(ref));
  if (matches.length === 1) return { provider: matches[0]!, id: ref };
  if (matches.length > 1) {
    return { provider: preferred.find((p) => matches.includes(p)) ?? matches[0]!, id: ref };
  }
  throw new ProviderError(
    `"${ref}" doesn't look like a photo id from any provider.`,
    `Use a prefix, e.g. pexels:123 or unsplash:KiRlN3jjVNU`,
  );
}

/** @deprecated use resolvePhotoRef */
export function parsePhotoRef(ref: string, fallbackProvider?: string): PhotoRef {
  return resolvePhotoRef(ref, fallbackProvider ? [fallbackProvider] : undefined);
}

export interface License {
  name: string;
  url: string;
  /** Whether the provider's terms require visible attribution when the photo is used. */
  attributionRequired: boolean;
  /** Display name and home link for "Photo by X on <Provider>" credit lines. */
  providerName?: string;
  providerUrl?: string;
}

/** Provider-neutral photo model. Every provider maps its API shape onto this. */
export interface Photo {
  /** Provider-local id, e.g. "12345678". */
  id: string;
  provider: string;
  width: number;
  height: number;
  /** Public page for the photo (attribution / open in browser). */
  pageUrl: string;
  photographer: string;
  photographerUrl?: string;
  /** Hex colour like "#A1B2C3", if the provider supplies one. */
  avgColor?: string;
  alt?: string;
  /** Small image suitable for terminal thumbnails (a few hundred px wide). */
  thumbUrl: string;
  /** A larger preview (~1000px) for `show`. */
  previewUrl: string;
  /** PNG variants of the above, if the provider can supply them (kitty protocol needs PNG). */
  thumbPngUrl?: string;
  previewPngUrl?: string;
  /** Named download sizes, e.g. { original, large2x, large, medium, small }. */
  sizes: Record<string, string>;
  license: License;
  /** Provider endpoint to call when the photo is downloaded (Unsplash requires this). */
  trackingUrl?: string;
}

export interface PhotoPage {
  photos: Photo[];
  page: number;
  perPage: number;
  total?: number;
  hasNext: boolean;
}

export type Orientation = "landscape" | "portrait" | "square";

export interface SearchOptions {
  query: string;
  page?: number;
  perPage?: number;
  orientation?: Orientation;
  color?: string;
  /** Provider-specific minimum size hint, e.g. "large" | "medium" | "small". */
  size?: string;
  locale?: string;
}

export interface ListOptions {
  page?: number;
  perPage?: number;
}

export interface Provider {
  readonly name: string;
  /** Ordered list of download size names, largest first. */
  readonly sizeNames: readonly string[];
  readonly defaultSize: string;
  /** What the provider-independent size name "max" resolves to. */
  readonly maxSize: string;
  search(opts: SearchOptions): Promise<PhotoPage>;
  curated(opts: ListOptions): Promise<PhotoPage>;
  get(id: string): Promise<Photo>;
  /** Called once per freshly downloaded photo; best effort, errors are ignored. */
  trackDownload?(photo: Photo): Promise<void>;
}

export interface ProviderContext {
  apiKey?: string;
  /** API response cache TTL in ms. */
  ttlMs: number;
}

export type ProviderFactory = (ctx: ProviderContext) => Provider;

export class ProviderError extends Error {
  constructor(message: string, public readonly hint?: string) {
    super(message);
    this.name = "ProviderError";
  }
}

import { fetchJson, HttpError } from "../http.ts";
import {
  ProviderError,
  type ListOptions,
  type Photo,
  type PhotoPage,
  type Provider,
  type ProviderContext,
  type SearchOptions,
} from "./types.ts";

/**
 * Unsplash provider.
 *
 * The photos are free (Unsplash License), but the API Guidelines that come
 * with an access key require three things this provider takes care of:
 *   - attribution links to the photographer and Unsplash with UTM parameters
 *   - a call to `download_location` whenever a photo is downloaded
 *   - using the CDN URLs the API returns (we never re-host)
 * See https://unsplash.com/documentation#guidelines--crediting
 */
const API = "https://api.unsplash.com";
const UTM = "utm_source=fabpix&utm_medium=referral";
const LICENSE = {
  name: "Unsplash License",
  url: "https://unsplash.com/license",
  attributionRequired: true, // required by the API Guidelines, not the license itself
  providerName: "Unsplash",
  providerUrl: `https://unsplash.com/?${UTM}`,
} as const;

interface UnsplashPhoto {
  id: string;
  width: number;
  height: number;
  color: string | null;
  description: string | null;
  alt_description: string | null;
  urls: { raw: string; full: string; regular: string; small: string; thumb: string };
  links: { html: string; download: string; download_location: string };
  user: { name: string; username: string; links: { html: string } };
}

interface UnsplashSearch {
  total: number;
  total_pages: number;
  results: UnsplashPhoto[];
}

/** Native names first, then the Pexels-style aliases so one settings file works for both providers. */
const SIZE_NAMES = ["raw", "full", "regular", "small", "thumb", "original", "large2x", "large", "medium"] as const;

function withUtm(url: string): string {
  return url + (url.includes("?") ? "&" : "?") + UTM;
}

/** `raw` accepts imgix parameters, which is how we get exact sizes and PNG. */
function variant(raw: string, params: string): string {
  return raw + (raw.includes("?") ? "&" : "?") + params;
}

function toPhoto(p: UnsplashPhoto): Photo {
  return {
    id: p.id,
    provider: "unsplash",
    width: p.width,
    height: p.height,
    pageUrl: withUtm(p.links.html),
    photographer: p.user.name,
    photographerUrl: withUtm(p.user.links.html),
    avgColor: p.color ?? undefined,
    alt: p.description || p.alt_description || undefined,
    thumbUrl: variant(p.urls.raw, "w=280&h=200&fit=crop&fm=jpg&q=70"),
    thumbPngUrl: variant(p.urls.raw, "w=280&h=200&fit=crop&fm=png"),
    previewUrl: variant(p.urls.raw, "w=940&fm=jpg&q=80"),
    previewPngUrl: variant(p.urls.raw, "w=940&fm=png"),
    sizes: {
      raw: p.urls.raw,
      full: p.urls.full,
      regular: p.urls.regular,
      small: p.urls.small,
      thumb: p.urls.thumb,
      original: p.urls.full,
      large2x: variant(p.urls.raw, "w=1880&fm=jpg&q=90"),
      large: p.urls.regular,
      medium: p.urls.small,
    },
    license: LICENSE,
    trackingUrl: p.links.download_location,
  };
}

const ORIENTATION: Record<string, string> = { landscape: "landscape", portrait: "portrait", square: "squarish" };

export function createUnsplash(ctx: ProviderContext): Provider {
  const request = async <T>(path: string, params: Record<string, string | number | undefined>): Promise<T> => {
    if (!ctx.apiKey) {
      throw new ProviderError(
        "No Unsplash access key configured.",
        "Create an app at https://unsplash.com/developers, copy its Access Key, then run:\n" +
          "  fabpix auth set <access-key> --provider unsplash\n" +
          "or export UNSPLASH_ACCESS_KEY=<access-key>",
      );
    }
    const url = new URL(API + path);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
    try {
      return await fetchJson<T>({
        url: url.toString(),
        headers: { Authorization: `Client-ID ${ctx.apiKey}`, "Accept-Version": "v1", "User-Agent": "fabpix" },
        ttlMs: ctx.ttlMs,
      });
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.status === 401) throw new ProviderError("Unsplash rejected the access key (401).", "Check it with:  fabpix auth status --provider unsplash");
        if (err.status === 403) throw new ProviderError("Unsplash rate limit hit (403).", "Demo apps get 50 requests/hour; apply for production in your Unsplash developer dashboard for 5 000/hour.");
        if (err.status === 404) throw new ProviderError("Unsplash: not found (404).");
        if (err.status === 400) throw new ProviderError(`Unsplash rejected the request (400): ${err.message.slice(0, 200)}`, "Colour must be one of: black_and_white, black, white, yellow, orange, red, purple, magenta, green, teal, blue");
        throw new ProviderError(`Unsplash API error ${err.status}: ${err.message.slice(0, 200)}`);
      }
      throw err;
    }
  };

  return {
    name: "unsplash",
    sizeNames: SIZE_NAMES,
    defaultSize: "full",
    // `raw` is the untouched upload (often 20 MB+); `full` has the same pixels as a ~3 MB JPEG.
    maxSize: "full",

    async search(opts: SearchOptions): Promise<PhotoPage> {
      const perPage = Math.min(opts.perPage ?? 10, 30);
      const page = opts.page ?? 1;
      const res = await request<UnsplashSearch>("/search/photos", {
        query: opts.query,
        page,
        per_page: perPage,
        orientation: opts.orientation ? ORIENTATION[opts.orientation] : undefined,
        color: opts.color,
      });
      return {
        photos: res.results.map(toPhoto),
        page,
        perPage,
        total: res.total,
        hasNext: page < res.total_pages,
      };
    },

    async curated(opts: ListOptions): Promise<PhotoPage> {
      const perPage = Math.min(opts.perPage ?? 10, 30);
      const page = opts.page ?? 1;
      const res = await request<UnsplashPhoto[]>("/photos", { page, per_page: perPage, order_by: "popular" });
      return { photos: res.map(toPhoto), page, perPage, hasNext: res.length === perPage };
    },

    async get(id: string): Promise<Photo> {
      return toPhoto(await request<UnsplashPhoto>(`/photos/${encodeURIComponent(id)}`, {}));
    },

    /** Required by the API Guidelines: counts the download for the photographer. Never cached. */
    async trackDownload(photo: Photo): Promise<void> {
      if (!photo.trackingUrl || !ctx.apiKey) return;
      await fetch(photo.trackingUrl, {
        headers: { Authorization: `Client-ID ${ctx.apiKey}`, "Accept-Version": "v1", "User-Agent": "fabpix" },
      });
    },
  };
}

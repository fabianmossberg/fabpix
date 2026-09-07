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

const API = "https://api.pexels.com/v1";

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  avg_color: string;
  alt: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    portrait: string;
    landscape: string;
    tiny: string;
  };
}

interface PexelsPage {
  page: number;
  per_page: number;
  total_results?: number;
  photos: PexelsPhoto[];
  next_page?: string;
}

const SIZE_NAMES = ["original", "large2x", "large", "medium", "small", "portrait", "landscape", "tiny"] as const;

function toPhoto(p: PexelsPhoto): Photo {
  return {
    id: String(p.id),
    provider: "pexels",
    width: p.width,
    height: p.height,
    pageUrl: p.url,
    photographer: p.photographer,
    photographerUrl: p.photographer_url,
    avgColor: p.avg_color,
    alt: p.alt || undefined,
    thumbUrl: p.src.tiny,
    previewUrl: p.src.large,
    sizes: Object.fromEntries(SIZE_NAMES.map((n) => [n, p.src[n]])),
  };
}

function toPage(res: PexelsPage): PhotoPage {
  return {
    photos: res.photos.map(toPhoto),
    page: res.page,
    perPage: res.per_page,
    total: res.total_results,
    hasNext: Boolean(res.next_page),
  };
}

export function createPexels(ctx: ProviderContext): Provider {
  const request = async <T>(path: string, params: Record<string, string | number | undefined>): Promise<T> => {
    if (!ctx.apiKey) {
      throw new ProviderError(
        "No Pexels API key configured.",
        "Get a free key at https://www.pexels.com/api/ then run:  fabpix auth set <key>\n" +
          "or export PEXELS_API_KEY=<key>",
      );
    }
    const url = new URL(API + path);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
    try {
      return await fetchJson<T>({
        url: url.toString(),
        headers: { Authorization: ctx.apiKey, "User-Agent": "fabpix" },
        ttlMs: ctx.ttlMs,
      });
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.status === 401) throw new ProviderError("Pexels rejected the API key (401).", "Check it with:  fabpix auth status");
        if (err.status === 404) throw new ProviderError("Pexels: not found (404).");
        if (err.status === 429) throw new ProviderError("Pexels rate limit hit (429).", "Free tier: 200 requests/hour, 20 000/month.");
        throw new ProviderError(`Pexels API error ${err.status}: ${err.message.slice(0, 200)}`);
      }
      throw err;
    }
  };

  return {
    name: "pexels",
    sizeNames: SIZE_NAMES,
    defaultSize: "original",

    async search(opts: SearchOptions): Promise<PhotoPage> {
      const res = await request<PexelsPage>("/search", {
        query: opts.query,
        page: opts.page ?? 1,
        per_page: Math.min(opts.perPage ?? 10, 80),
        orientation: opts.orientation,
        color: opts.color,
        size: opts.size,
        locale: opts.locale,
      });
      return toPage(res);
    },

    async curated(opts: ListOptions): Promise<PhotoPage> {
      const res = await request<PexelsPage>("/curated", {
        page: opts.page ?? 1,
        per_page: Math.min(opts.perPage ?? 10, 80),
      });
      return toPage(res);
    },

    async get(id: string): Promise<Photo> {
      return toPhoto(await request<PexelsPhoto>(`/photos/${encodeURIComponent(id)}`, {}));
    },
  };
}

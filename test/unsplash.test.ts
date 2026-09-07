import { afterEach, describe, expect, test } from "bun:test";
import { createUnsplash } from "../src/providers/unsplash.ts";
import { getProvider } from "../src/providers/index.ts";
import { ProviderError } from "../src/providers/types.ts";
import { resolveApiKey } from "../src/config.ts";

const sample = {
  id: "Zx8RdG0h_Yk",
  width: 4000,
  height: 6000,
  color: "#262626",
  description: null,
  alt_description: "a cat on a chair",
  urls: {
    raw: "https://images.unsplash.com/photo-1?ixid=abc",
    full: "https://images.unsplash.com/photo-1?q=85&fm=jpg",
    regular: "https://images.unsplash.com/photo-1?w=1080",
    small: "https://images.unsplash.com/photo-1?w=400",
    thumb: "https://images.unsplash.com/photo-1?w=200",
  },
  links: {
    html: "https://unsplash.com/photos/Zx8RdG0h_Yk",
    download: "https://unsplash.com/photos/Zx8RdG0h_Yk/download",
    download_location: "https://api.unsplash.com/photos/Zx8RdG0h_Yk/download",
  },
  user: { name: "Ada Lovelace", username: "ada", links: { html: "https://unsplash.com/@ada" } },
};

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

type Seen = { url: string; headers: Record<string, string> };
function mockFetch(handler: (url: string) => Response): Seen[] {
  const seen: Seen[] = [];
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), headers: (init?.headers as Record<string, string>) ?? {} });
    return Promise.resolve(handler(String(url)));
  }) as typeof fetch;
  return seen;
}

describe("unsplash provider", () => {
  test("is registered and reads UNSPLASH_ACCESS_KEY", () => {
    expect(getProvider({ name: "unsplash", settings: {} }).name).toBe("unsplash");
    expect(resolveApiKey("unsplash", {}, { UNSPLASH_ACCESS_KEY: "AK" })).toBe("AK");
  });

  test("helpful error without a key", async () => {
    const p = createUnsplash({ apiKey: undefined, ttlMs: 0 });
    await expect(p.search({ query: "x" })).rejects.toBeInstanceOf(ProviderError);
  });

  test("search: Client-ID auth, squarish orientation, per_page cap, paging from total_pages", async () => {
    const seen = mockFetch(() => Response.json({ total: 100, total_pages: 4, results: [sample] }));
    const p = createUnsplash({ apiKey: "AK", ttlMs: 0 });
    const page = await p.search({ query: "cats", orientation: "square", perPage: 50, page: 4 });
    expect(seen[0]!.headers.Authorization).toBe("Client-ID AK");
    const url = new URL(seen[0]!.url);
    expect(url.pathname).toBe("/search/photos");
    expect(url.searchParams.get("orientation")).toBe("squarish");
    expect(url.searchParams.get("per_page")).toBe("30");
    expect(page.total).toBe(100);
    expect(page.hasNext).toBe(false);
  });

  test("maps to the Photo model with UTM links, PNG variants, aliases and tracking url", async () => {
    mockFetch(() => Response.json(sample));
    const photo = await createUnsplash({ apiKey: "AK", ttlMs: 0 }).get("Zx8RdG0h_Yk");
    expect(photo.provider).toBe("unsplash");
    expect(photo.pageUrl).toBe("https://unsplash.com/photos/Zx8RdG0h_Yk?utm_source=fabpix&utm_medium=referral");
    expect(photo.photographerUrl).toBe("https://unsplash.com/@ada?utm_source=fabpix&utm_medium=referral");
    expect(photo.alt).toBe("a cat on a chair");
    expect(photo.thumbUrl).toContain("fm=jpg");
    expect(photo.thumbPngUrl).toContain("fm=png");
    expect(photo.sizes.original).toBe(sample.urls.full);
    expect(photo.sizes.large).toBe(sample.urls.regular);
    expect(photo.sizes.large2x).toContain("w=1880");
    expect(photo.license.attributionRequired).toBe(true);
    expect(photo.license.providerName).toBe("Unsplash");
    expect(photo.trackingUrl).toBe(sample.links.download_location);
  });

  test("trackDownload pings download_location with auth", async () => {
    const seen = mockFetch((url) => (url.includes("/download") ? Response.json({ url: "x" }) : Response.json(sample)));
    const p = createUnsplash({ apiKey: "AK", ttlMs: 0 });
    const photo = await p.get("Zx8RdG0h_Yk");
    await p.trackDownload!(photo);
    const ping = seen.find((s) => s.url === sample.links.download_location);
    expect(ping?.headers.Authorization).toBe("Client-ID AK");
  });

  test("403 is reported as a rate limit", async () => {
    mockFetch(() => new Response("Rate Limit Exceeded", { status: 403 }));
    await expect(createUnsplash({ apiKey: "AK", ttlMs: 0 }).curated({})).rejects.toThrow(/rate limit/i);
  });
});

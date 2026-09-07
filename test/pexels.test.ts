import { afterEach, describe, expect, test } from "bun:test";
import { createPexels } from "../src/providers/pexels.ts";
import { ProviderError } from "../src/providers/types.ts";
import { parsePhotoRef } from "../src/providers/index.ts";

const sample = {
  id: 42, width: 300, height: 200, url: "https://www.pexels.com/photo/42/",
  photographer: "Ada", photographer_url: "https://www.pexels.com/@ada", avg_color: "#112233", alt: "a thing",
  src: {
    original: "o", large2x: "l2", large: "l", medium: "m", small: "s", portrait: "p", landscape: "ls", tiny: "t",
  },
};

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => Promise.resolve(handler(String(url), init))) as typeof fetch;
}

describe("pexels provider", () => {
  test("throws a helpful error without an api key", async () => {
    const p = createPexels({ apiKey: undefined, ttlMs: 0 });
    await expect(p.curated({})).rejects.toBeInstanceOf(ProviderError);
  });

  test("maps search response to Photo model and sends auth header", async () => {
    let seen: { url: string; auth?: string } | undefined;
    mockFetch((url, init) => {
      seen = { url, auth: (init?.headers as Record<string, string>)?.Authorization };
      return Response.json({ page: 1, per_page: 1, total_results: 1, photos: [sample], next_page: "x" });
    });
    const p = createPexels({ apiKey: "KEY", ttlMs: 0 });
    const page = await p.search({ query: "cats", perPage: 1, orientation: "landscape" });
    expect(seen?.auth).toBe("KEY");
    expect(seen?.url).toContain("query=cats");
    expect(seen?.url).toContain("orientation=landscape");
    expect(page.hasNext).toBe(true);
    expect(page.total).toBe(1);
    const photo = page.photos[0]!;
    expect(photo).toMatchObject({ id: "42", provider: "pexels", thumbUrl: "t", previewUrl: "l", avgColor: "#112233" });
    expect(photo.sizes.original).toBe("o");
  });

  test("maps 401 to a ProviderError", async () => {
    mockFetch(() => new Response("nope", { status: 401 }));
    const p = createPexels({ apiKey: "BAD", ttlMs: 0 });
    await expect(p.get("1")).rejects.toThrow(/401/);
  });
});

describe("parsePhotoRef", () => {
  test("plain id uses the fallback provider", () => {
    expect(parsePhotoRef("123", "pexels")).toEqual({ provider: "pexels", id: "123" });
  });
  test("prefixed id selects provider", () => {
    expect(parsePhotoRef("unsplash:abc")).toEqual({ provider: "unsplash", id: "abc" });
  });
});

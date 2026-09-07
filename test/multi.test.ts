import { describe, expect, test } from "bun:test";
import { createMulti } from "../src/providers/multi.ts";
import { resolvePhotoRef, selectProviders, providerNames } from "../src/providers/index.ts";
import { ProviderError, type Photo, type PhotoPage, type Provider } from "../src/providers/types.ts";

const photo = (provider: string, id: string): Photo => ({
  id, provider, width: 1, height: 1, pageUrl: "u", photographer: "p", thumbUrl: "t", previewUrl: "p",
  sizes: {}, license: { name: "L", url: "u", attributionRequired: false },
});

function fake(name: string, ids: string[], opts: { total?: number; hasNext?: boolean; fail?: Error } = {}): Provider & { calls: number[] } {
  const p = {
    name, sizeNames: ["original"], defaultSize: "original", maxSize: "original", calls: [] as number[],
    async search({ perPage }: { perPage?: number }): Promise<PhotoPage> {
      p.calls.push(perPage ?? -1);
      if (opts.fail) throw opts.fail;
      return { photos: ids.map((id) => photo(name, id)), page: 1, perPage: perPage ?? 10, total: opts.total, hasNext: opts.hasNext ?? false };
    },
    curated: (o: { perPage?: number }) => p.search(o),
    async get(): Promise<Photo> { throw new Error("unused"); },
  };
  return p;
}

describe("selectProviders", () => {
  test("string, list, comma-separated and all", () => {
    expect(selectProviders(undefined)).toEqual(["pexels"]);
    expect(selectProviders("unsplash")).toEqual(["unsplash"]);
    expect(selectProviders("pexels, unsplash")).toEqual(["pexels", "unsplash"]);
    expect(selectProviders(["unsplash", "pexels", "unsplash"])).toEqual(["unsplash", "pexels"]);
    expect(selectProviders("all")).toEqual(providerNames());
    expect(() => selectProviders("flickr")).toThrow(ProviderError);
  });
});

describe("resolvePhotoRef", () => {
  test("prefix wins and is validated", () => {
    expect(resolvePhotoRef("unsplash:123")).toEqual({ provider: "unsplash", id: "123" });
    expect(() => resolvePhotoRef("flickr:1")).toThrow(/Unknown provider/);
  });
  test("bare ids are inferred from their shape", () => {
    expect(resolvePhotoRef("1054666")).toEqual({ provider: "pexels", id: "1054666" });
    expect(resolvePhotoRef("Zx8RdG0h_Yk")).toEqual({ provider: "unsplash", id: "Zx8RdG0h_Yk" });
    expect(resolvePhotoRef("Zx8RdG0h_Yk", ["pexels"])).toEqual({ provider: "unsplash", id: "Zx8RdG0h_Yk" });
  });
  test("an 11-digit id matches both patterns and falls back to the preferred provider", () => {
    expect(resolvePhotoRef("12345678901", ["pexels"]).provider).toBe("pexels");
    expect(resolvePhotoRef("12345678901", ["unsplash", "pexels"]).provider).toBe("unsplash");
  });
  test("unrecognised ids ask for a prefix", () => {
    expect(() => resolvePhotoRef("not an id")).toThrow(/doesn't look like a photo id/);
  });
});

describe("multi provider", () => {
  test("interleaves results, splits the budget, sums totals", async () => {
    const a = fake("a", ["a1", "a2", "a3"], { total: 10, hasNext: true });
    const b = fake("b", ["b1"], { total: 5 });
    const m = createMulti([a, b]);
    const page = await m.search({ query: "x", perPage: 7 });
    expect(m.name).toBe("a + b");
    expect(a.calls).toEqual([4]);
    expect(b.calls).toEqual([4]);
    expect(page.photos.map((p) => `${p.provider}:${p.id}`)).toEqual(["a:a1", "b:b1", "a:a2", "a:a3"]);
    expect(page.total).toBe(15);
    expect(page.hasNext).toBe(true);
    expect(page.perPage).toBe(7);
  });

  test("one failing provider warns and the rest still return", async () => {
    const ok = fake("ok", ["1"]);
    const bad = fake("bad", [], { fail: new ProviderError("no key", "get one") });
    const written: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((s: string) => { written.push(String(s)); return true; }) as typeof process.stderr.write;
    try {
      const page = await createMulti([ok, bad]).curated({ perPage: 2 });
      expect(page.photos.map((p) => p.id)).toEqual(["1"]);
      expect(written.join("")).toContain("warning: bad: no key (get one)");
    } finally {
      process.stderr.write = orig;
    }
  });

  test("all providers failing rethrows the first error", async () => {
    const m = createMulti([fake("x", [], { fail: new Error("boom") }), fake("y", [], { fail: new Error("bang") })]);
    await expect(m.search({ query: "q" })).rejects.toThrow("boom");
  });

  test("get refuses without a prefix", async () => {
    await expect(createMulti([fake("x", [])]).get("1")).rejects.toThrow(/prefixed id/);
  });
});

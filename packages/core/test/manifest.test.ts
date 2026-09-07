import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readManifest, writeManifest, upsert, photoKey, sidecarPath, writeSidecar, type Manifest } from "../src/manifest.ts";
import type { Photo } from "../src/providers/types.ts";

const photo = (over: Partial<Photo> = {}): Photo => ({
  id: "1", provider: "pexels", width: 30, height: 20, pageUrl: "https://p/1", photographer: "Ada Lovelace",
  photographerUrl: "https://p/@ada", thumbUrl: "t", previewUrl: "p", sizes: { original: "o" },
  license: { name: "Pexels License", url: "https://www.pexels.com/license/", attributionRequired: false },
  ...over,
});

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "fabpix-man-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("manifest", () => {
  test("empty when missing, round-trips, atomic temp file cleaned up", () => {
    expect(readManifest(dir)).toEqual({ version: 1, photos: {} });
    const m = upsert({ version: 1, photos: {} }, photo(), { path: "a.jpg", size: "original", bytes: 10, at: new Date(0) });
    writeManifest(dir, m);
    expect(readManifest(dir)).toEqual(m);
    expect(existsSync(join(dir, "fabpix.manifest.json"))).toBe(true);
    expect(readFileSync(join(dir, "fabpix.manifest.json"), "utf8").endsWith("}\n")).toBe(true);
  });

  test("upsert replaces the same size, keeps other sizes, refreshes the record", () => {
    let m: Manifest = { version: 1, photos: {} };
    m = upsert(m, photo(), { path: "a-original.jpg", size: "original", bytes: 10 });
    m = upsert(m, photo(), { path: "a-large.jpg", size: "large", bytes: 5 });
    m = upsert(m, photo({ alt: "new alt" }), { path: "a-original.jpg", size: "original", bytes: 12 });
    const entry = m.photos[photoKey(photo())]!;
    expect(entry.files.map((f) => [f.path, f.bytes])).toEqual([["a-large.jpg", 5], ["a-original.jpg", 12]]);
    expect(entry.alt).toBe("new alt");
  });

  test("rejects a foreign json file", () => {
    writeManifest(dir, { version: 1, photos: {} });
    require("node:fs").writeFileSync(join(dir, "fabpix.manifest.json"), '{"hello":1}');
    expect(() => readManifest(dir)).toThrow(/not a fabpix manifest/);
  });

  test("sidecar sits next to the image", () => {
    expect(sidecarPath("/x/photo-large.jpg")).toBe("/x/photo-large.json");
    const p = writeSidecar(join(dir, "img.jpeg"), photo(), { size: "large", bytes: 3, downloadedAt: "t" });
    expect(JSON.parse(readFileSync(p, "utf8")).file).toEqual({ path: "img.jpeg", size: "large", bytes: 3, downloadedAt: "t" });
  });
});

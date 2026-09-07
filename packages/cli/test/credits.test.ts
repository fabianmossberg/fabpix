import { describe, expect, test } from "bun:test";
import { groupCredits, formatCredits } from "../src/commands/credits.ts";
import type { Photo } from "@fabianmossberg/fabpix-core";

const photo = (over: Partial<Photo> = {}): Photo => ({
  id: "1", provider: "pexels", width: 30, height: 20, pageUrl: "https://p/1", photographer: "Ada Lovelace",
  photographerUrl: "https://p/@ada", thumbUrl: "t", previewUrl: "p", sizes: { original: "o" },
  license: { name: "Pexels License", url: "https://www.pexels.com/license/", attributionRequired: false },
  ...over,
});

describe("credits", () => {
  const entries = [
    { ...photo({ id: "2", photographer: "Zed", photographerUrl: undefined }), files: [{ path: "z.jpg", size: "o", bytes: 1, downloadedAt: "t" }] },
    { ...photo({ id: "1" }), files: [{ path: "a1.jpg", size: "o", bytes: 1, downloadedAt: "t" }] },
    { ...photo({ id: "3", pageUrl: "https://p/3" }), files: [{ path: "a3.jpg", size: "o", bytes: 1, downloadedAt: "t" }] },
  ];

  test("groups by photographer, sorted, counting photos", () => {
    const c = groupCredits(entries);
    expect(c.map((x) => [x.photographer, x.photos.length])).toEqual([["Ada Lovelace", 2], ["Zed", 1]]);
    expect(c[0]!.photos.map((p) => p.id)).toEqual(["1", "3"]);
  });

  test("markdown output links photographer, photos and license", () => {
    const md = formatCredits(groupCredits(entries), entries, "markdown");
    expect(md).toContain("- [Ada Lovelace](https://p/@ada) on Pexels ([photo 1](https://p/1), [photo 2](https://p/3))");
    expect(md).toContain("- Zed on Pexels ([photo](https://p/1))");
    expect(md).toContain("_Pexels: [Pexels License](https://www.pexels.com/license/)_");
  });

  test("json output carries both groups and raw entries", () => {
    const j = JSON.parse(formatCredits(groupCredits(entries), entries, "json"));
    expect(j.credits.length).toBe(2);
    expect(j.photos.length).toBe(3);
  });
});

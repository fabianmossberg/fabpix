import { describe, expect, test } from "bun:test";
import { renderGridRow, tilesPerRow, tileColumn } from "../src/render/grid.ts";
import { kittySequence, isPng } from "../src/render/preview.ts";
import { fittedPageSize, resolveLayout, thumbUrlFor } from "../src/commands/list.ts";
import { truncateWidth, displayWidth } from "../src/format.ts";
import type { Photo } from "../src/providers/types.ts";

const opts = { cols: 10, rows: 3, gap: 2, captionRows: 2 };

describe("grid geometry", () => {
  test("tiles per row and tile columns", () => {
    expect(tilesPerRow(80, opts)).toBe(6); // (80+2)/12
    expect(tilesPerRow(5, opts)).toBe(1);
    expect(tileColumn(0, opts)).toBe(1);
    expect(tileColumn(2, opts)).toBe(25);
  });
});

describe("renderGridRow", () => {
  test("positions every tile with restore + column jump and lands below the row", () => {
    const out = renderGridRow(
      [{ imageSeq: "IMG1", caption: ["c1a", "c1b"] }, { artLines: ["A1", "A2", "A3", "A4"], caption: ["c2a"] }],
      opts,
    );
    expect(out.startsWith("\n".repeat(6) + "\x1b[6A\x1b7")).toBe(true);
    expect(out).toContain("\x1b8\x1b[1GIMG1");
    expect(out).toContain("\x1b8\x1b[3B\x1b[1Gc1a"); // caption row 0 sits `rows` lines down
    expect(out).toContain("\x1b8\x1b[4B\x1b[1Gc1b");
    expect(out).toContain("\x1b8\x1b[13GA1"); // chafa line 0 of tile 2
    expect(out).toContain("\x1b8\x1b[2B\x1b[13GA3"); // chafa line 2
    expect(out).not.toContain("A4"); // clipped to rows
    expect(out.endsWith("\x1b8\x1b[5B\r\n")).toBe(true);
  });
});

describe("kittySequence", () => {
  test("chunks at 4096 base64 chars, m=1 except the last, C=1 keeps cursor", () => {
    const bytes = new Uint8Array(5000).fill(7);
    const seq = kittySequence(bytes, { cols: 24, rows: 8 });
    const chunks = [...seq.matchAll(/\x1b_G([^;]*);([^\x1b]*)\x1b\\/g)];
    expect(chunks.length).toBe(2); // 5000 bytes → 6668 b64 chars → 2 chunks
    expect(chunks[0]![1]).toBe("a=T,f=100,c=24,r=8,C=1,q=2,m=1");
    expect(chunks[0]![2]!.length).toBe(4096);
    expect(chunks[1]![1]).toBe("m=0");
    expect(chunks.map((c) => c[2]).join("")).toBe(Buffer.from(bytes).toString("base64"));
  });
  test("isPng detects the magic bytes", () => {
    expect(isPng(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0]))).toBe(true);
    expect(isPng(new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0]))).toBe(false);
  });
});

describe("page sizing and layout", () => {
  test("fills the terminal in grid mode, capped at 80", () => {
    // 100 cols → 3 tiles of 24+2 ; 40 rows - 3 chrome = 37 usable / (8+2+1)=3 grid rows → 9
    expect(fittedPageSize("grid", { rows: 8, cols: 24 }, { rows: 40, cols: 100 })).toBe(9);
    expect(fittedPageSize("grid", { rows: 8, cols: 24 }, { rows: 400, cols: 400 })).toBe(80);
    expect(fittedPageSize("list", { rows: 8, cols: 24 }, { rows: 30, cols: 100 })).toBe(3);
    expect(fittedPageSize("list", { rows: 8, cols: 24 }, { rows: 5, cols: 100 })).toBe(1);
  });
  test("layout defaults to grid whenever images can render", () => {
    expect(resolveLayout(undefined, "iterm")).toBe("grid");
    expect(resolveLayout(undefined, "kitty")).toBe("grid");
    expect(resolveLayout(undefined, "none")).toBe("list");
    expect(resolveLayout("list", "iterm")).toBe("list");
  });
  test("kitty gets the PNG thumbnail when available", () => {
    const p = { thumbUrl: "j", thumbPngUrl: "png" } as Photo;
    expect(thumbUrlFor(p, "kitty")).toBe("png");
    expect(thumbUrlFor(p, "iterm")).toBe("j");
    expect(thumbUrlFor({ thumbUrl: "j" } as Photo, "kitty")).toBe("j");
  });
});

describe("truncateWidth", () => {
  test("counts CJK as double width", () => {
    expect(displayWidth("정규송 Nui")).toBe(10);
    expect(truncateWidth("정규송 Nui MALAMA", 8)).toBe("정규송…");
    expect(truncateWidth("short", 8)).toBe("short");
  });
});

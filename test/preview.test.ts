import { describe, expect, test } from "bun:test";
import { itermSequence, blockWithSideText, sideBySide } from "../src/render/preview.ts";
import { detectProtocol, tmuxPassthrough } from "../src/render/terminal.ts";

describe("itermSequence", () => {
  test("emits OSC 1337 with inline, box size and base64 payload", () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const seq = itermSequence(bytes, { cols: 24, rows: 8 });
    expect(seq.startsWith("\x1b]1337;File=")).toBe(true);
    expect(seq).toContain("inline=1");
    expect(seq).toContain("width=24;height=8;preserveAspectRatio=1");
    expect(seq).toContain("size=4");
    expect(seq.endsWith(":AQIDBA==\x07")).toBe(true);
  });
});

describe("blockWithSideText", () => {
  test("reserves rows, saves/restores cursor, and lands below the image", () => {
    const out = blockWithSideText("IMG", { cols: 10, rows: 3 }, ["a", "b", "c", "d"]);
    expect(out.startsWith("\n\n\n\n\x1b[4A")).toBe(true); // rows+1 newlines, then up rows+1
    expect(out).toContain("\x1b7IMG\x1b8"); // DECSC, image, DECRC
    expect(out).toContain("\x1b[13Ga"); // gutter = cols + 3
    expect(out).not.toContain("\x1b[13Gd"); // 4th line clipped to rows
    expect(out.endsWith("\x1b8\x1b[3B\r\n")).toBe(true);
  });
});

describe("sideBySide", () => {
  test("zips columns using absolute column jumps", () => {
    const out = sideBySide(["L1", "L2"], ["R1"], 5);
    expect(out).toBe("L1\x1b[8GR1\nL2\x1b[8G\n\n");
  });
});

describe("detectProtocol", () => {
  test("non-tty is none unless forced", () => {
    expect(detectProtocol({}, false)).toBe("none");
    expect(detectProtocol({ FABPIX_PROTOCOL: "iterm" }, false)).toBe("iterm");
  });
  test("iTerm2 / WezTerm / kitty / ghostty", () => {
    expect(detectProtocol({ TERM_PROGRAM: "iTerm.app" }, true)).toBe("iterm");
    expect(detectProtocol({ TERM_PROGRAM: "WezTerm" }, true)).toBe("iterm");
    expect(detectProtocol({ TERM: "xterm-kitty" }, true)).toBe("kitty");
    expect(detectProtocol({ TERM: "xterm-ghostty" }, true)).toBe("kitty");
  });
});

describe("tmuxPassthrough", () => {
  test("wraps in DCS and doubles ESC", () => {
    expect(tmuxPassthrough("\x1bX")).toBe("\x1bPtmux;\x1b\x1bX\x1b\\");
  });
});

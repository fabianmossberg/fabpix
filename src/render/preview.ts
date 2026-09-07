import { spawnSync } from "node:child_process";
import { detectProtocol, insideTmux, tmuxPassthrough, type ImageProtocol } from "./terminal.ts";
import { swatch } from "./style.ts";

export interface PreviewBox {
  /** Width of the image box in terminal cells. */
  cols: number;
  /** Height of the image box in terminal rows. */
  rows: number;
}

export interface PreviewOptions extends PreviewBox {
  protocol?: ImageProtocol;
  tmux?: boolean;
}

/**
 * iTerm2 inline image escape (the same one `imgcat` emits).
 * With both width and height set and preserveAspectRatio=1, iTerm scales the
 * image to fit inside the cols×rows box without stretching.
 */
export function itermSequence(bytes: Uint8Array, box: PreviewBox, name = "preview"): string {
  const b64 = Buffer.from(bytes).toString("base64");
  const nameB64 = Buffer.from(name).toString("base64");
  return (
    `\x1b]1337;File=name=${nameB64};size=${bytes.byteLength};inline=1;` +
    `width=${box.cols};height=${box.rows};preserveAspectRatio=1:${b64}\x07`
  );
}

/**
 * Layout helper: draws the image in a fixed box and writes `lines` to its right.
 *
 * Cursor choreography (works on any VT100 terminal):
 *   1. Emit rows+1 newlines so the box area exists even at the bottom of the screen,
 *      then move back up. This prevents scrolling from invalidating saved positions.
 *   2. Save cursor (DECSC), draw image, restore cursor (DECRC) → back at top-left.
 *   3. For each text line: jump to column cols+2, print, move down one row.
 *   4. Restore again and move down `rows` so the next block starts under the image.
 */
export function blockWithSideText(imageSeq: string, box: PreviewBox, lines: string[]): string {
  const gutter = box.cols + 3;
  let out = "\n".repeat(box.rows + 1) + `\x1b[${box.rows + 1}A`;
  out += "\x1b7" + imageSeq + "\x1b8";
  const visible = lines.slice(0, box.rows);
  for (let i = 0; i < visible.length; i++) {
    out += `\x1b[${gutter}G` + visible[i] + (i < visible.length - 1 ? "\x1b[1B" : "");
  }
  out += "\x1b8" + `\x1b[${box.rows}B\r\n`;
  return out;
}

/** Zip two column-blocks together line by line (used for chafa's ANSI-art output). */
export function sideBySide(left: string[], right: string[], leftWidth: number): string {
  const n = Math.max(left.length, right.length);
  const rows: string[] = [];
  for (let i = 0; i < n; i++) {
    const l = left[i] ?? "";
    const r = right[i] ?? "";
    // Left lines carry ANSI codes; we can't measure them, so use an absolute column jump.
    rows.push(l + `\x1b[${leftWidth + 3}G` + r);
  }
  return rows.join("\n") + "\n\n";
}

export function chafaLines(bytes: Uint8Array, box: PreviewBox): string[] | undefined {
  const res = spawnSync("chafa", ["--size", `${box.cols}x${box.rows}`, "--format", "symbols", "-"], {
    input: bytes,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "ignore"],
  });
  if (res.status !== 0 || !res.stdout) return undefined;
  return res.stdout.replace(/\n$/, "").split("\n");
}

const KITTY_CHUNK = 4096;

/**
 * kitty graphics protocol (kitty, Ghostty, WezTerm). Requires PNG (f=100).
 * a=T transmit+display, c/r scale into a cell box, C=1 leaves the cursor
 * where it was so the caller controls layout. Payload is sent in 4 KiB
 * chunks; m=1 on every chunk except the last.
 */
export function kittySequence(pngBytes: Uint8Array, box: PreviewBox): string {
  const b64 = Buffer.from(pngBytes).toString("base64");
  let out = "";
  for (let i = 0; i < b64.length; i += KITTY_CHUNK) {
    const chunk = b64.slice(i, i + KITTY_CHUNK);
    const last = i + KITTY_CHUNK >= b64.length;
    const ctrl = i === 0 ? `a=T,f=100,c=${box.cols},r=${box.rows},C=1,q=2,m=${last ? 0 : 1}` : `m=${last ? 0 : 1}`;
    out += `\x1b_G${ctrl};${chunk}\x1b\\`;
  }
  return out;
}

/** Is `bytes` a PNG? (kitty needs PNG; a provider without PNG variants falls back to chafa.) */
export function isPng(bytes: Uint8Array): boolean {
  return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

/** Build the terminal-native image escape for the detected protocol, or undefined if none applies. */
export function nativeImageSequence(bytes: Uint8Array, box: PreviewBox, protocol: ImageProtocol, tmux: boolean): string | undefined {
  let seq: string | undefined;
  if (protocol === "iterm") seq = itermSequence(bytes, box);
  else if (protocol === "kitty" && isPng(bytes)) seq = kittySequence(bytes, box);
  if (!seq) return undefined;
  return tmux ? tmuxPassthrough(seq) : seq;
}

export interface RenderInput {
  bytes?: Uint8Array;
  avgColor?: string;
  lines: string[];
}

/**
 * Render one photo block: thumbnail (if possible) plus its metadata lines.
 * Falls back gracefully: iterm → kitty → chafa → colour swatch → plain text.
 */
export function renderBlock({ bytes, avgColor, lines }: RenderInput, opts: PreviewOptions): string {
  const protocol = opts.protocol ?? detectProtocol();
  const tmux = opts.tmux ?? insideTmux();
  const box = { cols: opts.cols, rows: opts.rows };

  if (bytes) {
    const seq = nativeImageSequence(bytes, box, protocol, tmux);
    if (seq) return blockWithSideText(seq, box, lines);
  }
  if (bytes && (protocol === "chafa" || protocol === "kitty")) {
    const art = chafaLines(bytes, box);
    if (art) return sideBySide(art, lines, box.cols);
  }
  // Text-only fallback: a colour swatch in front of the first line.
  const sw = swatch(avgColor, 2);
  const first = (sw ? sw + " " : "") + (lines[0] ?? "");
  const rest = lines.slice(1).map((l) => (sw ? "   " : "") + l);
  return [first, ...rest].join("\n") + "\n\n";
}

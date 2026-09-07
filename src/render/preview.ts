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

/** Simple stacked layout: image, then the text lines beneath it. */
export function blockStacked(imageOutput: string, lines: string[]): string {
  return imageOutput + (imageOutput.endsWith("\n") ? "" : "\n") + lines.join("\n") + "\n\n";
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

function chafaLines(bytes: Uint8Array, box: PreviewBox): string[] | undefined {
  const res = spawnSync("chafa", ["--size", `${box.cols}x${box.rows}`, "--format", "symbols", "-"], {
    input: bytes,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "ignore"],
  });
  if (res.status !== 0 || !res.stdout) return undefined;
  return res.stdout.replace(/\n$/, "").split("\n");
}

function kittenIcat(bytes: Uint8Array, box: PreviewBox): string | undefined {
  // `kitten icat` ships with kitty (and Ghostty users usually have it). It decodes JPEG for us.
  for (const cmd of [["kitten", "icat"], ["kitty", "+kitten", "icat"]]) {
    const res = spawnSync(cmd[0]!, [...cmd.slice(1), "--stdin=yes", "--align=left", "--transfer-mode=stream", "--place", `${box.cols}x${box.rows}@0x0`, "--scale-up"], {
      input: bytes,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    if (res.status === 0 && res.stdout) return res.stdout;
  }
  return undefined;
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

  if (bytes && protocol === "iterm") {
    const seq = itermSequence(bytes, box);
    return blockWithSideText(tmux ? tmuxPassthrough(seq) : seq, box, lines);
  }
  if (bytes && protocol === "kitty") {
    const out = kittenIcat(bytes, box);
    if (out) return blockStacked(out, lines);
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

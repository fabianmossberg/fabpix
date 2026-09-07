import { colorEnabled } from "./terminal.ts";

const on = colorEnabled();
const wrap = (open: string, close = "\x1b[0m") => (s: string) => (on ? open + s + close : s);

export const bold = wrap("\x1b[1m", "\x1b[22m");
export const dim = wrap("\x1b[2m", "\x1b[22m");
export const underline = wrap("\x1b[4m", "\x1b[24m");
export const cyan = wrap("\x1b[36m", "\x1b[39m");
export const yellow = wrap("\x1b[33m", "\x1b[39m");
export const red = wrap("\x1b[31m", "\x1b[39m");
export const green = wrap("\x1b[32m", "\x1b[39m");

/** A block of `width` cells painted with a hex colour (24-bit ANSI). */
export function swatch(hex: string | undefined, width = 2): string {
  if (!on || !hex) return "";
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "";
  const n = Number.parseInt(m[1]!, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `\x1b[48;2;${r};${g};${b}m${" ".repeat(width)}\x1b[49m`;
}

/** OSC 8 hyperlink; degrades to plain text on terminals without support. */
export function link(url: string, text = url): string {
  if (!on) return text;
  return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;
}

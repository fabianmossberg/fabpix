import { execSync } from "node:child_process";

export type ImageProtocol = "iterm" | "kitty" | "chafa" | "none";

let chafaChecked: boolean | undefined;
function hasChafa(): boolean {
  if (chafaChecked === undefined) {
    try {
      execSync("command -v chafa", { stdio: "ignore" });
      chafaChecked = true;
    } catch {
      chafaChecked = false;
    }
  }
  return chafaChecked;
}

/** Detect which inline-image protocol the current terminal understands. */
export function detectProtocol(env: NodeJS.ProcessEnv = process.env, isTTY = process.stdout.isTTY): ImageProtocol {
  const forced = env.FABPIX_PROTOCOL as ImageProtocol | undefined;
  if (forced && ["iterm", "kitty", "chafa", "none"].includes(forced)) return forced;
  if (!isTTY) return "none";

  const termProgram = env.TERM_PROGRAM ?? "";
  const term = env.TERM ?? "";
  if (termProgram === "iTerm.app" || env.LC_TERMINAL === "iTerm2" || termProgram === "WezTerm" || termProgram === "vscode" && env.ITERM_SESSION_ID) {
    return "iterm";
  }
  if (term.startsWith("xterm-kitty") || env.KITTY_WINDOW_ID || term === "xterm-ghostty" || env.GHOSTTY_RESOURCES_DIR) {
    return "kitty";
  }
  if (hasChafa()) return "chafa";
  return "none";
}

export function insideTmux(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.TMUX);
}

/** Wrap an escape sequence so tmux forwards it to the outer terminal (needs `allow-passthrough on`). */
export function tmuxPassthrough(seq: string): string {
  return "\x1bPtmux;" + seq.replaceAll("\x1b", "\x1b\x1b") + "\x1b\\";
}

export function colorEnabled(env: NodeJS.ProcessEnv = process.env, isTTY = process.stdout.isTTY): boolean {
  if (env.NO_COLOR !== undefined) return false;
  if (env.FORCE_COLOR !== undefined) return true;
  return Boolean(isTTY);
}

export function terminalColumns(): number {
  return process.stdout.columns || 80;
}

export function terminalRows(): number {
  return process.stdout.rows || 24;
}

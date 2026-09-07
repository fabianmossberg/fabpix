export type PagerKey = "next" | "prev" | "quit";

/**
 * Wait for one keypress on a raw-mode TTY.
 *   space / enter / n / j / → / ↓   next page
 *   b / p / k / ← / ↑               previous page
 *   q / esc / ctrl-c                 quit
 */
export function waitForKey(stdin: NodeJS.ReadStream = process.stdin): Promise<PagerKey> {
  return new Promise((resolve) => {
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const done = (key: PagerKey) => {
      stdin.off("data", onData);
      stdin.setRawMode(wasRaw ?? false);
      stdin.pause();
      resolve(key);
    };

    const onData = (chunk: string) => {
      switch (chunk) {
        case " ": case "\r": case "\n": case "n": case "j": case "\x1b[C": case "\x1b[B":
          return done("next");
        case "b": case "p": case "k": case "\x1b[D": case "\x1b[A":
          return done("prev");
        case "q": case "Q": case "\x1b": case "\x03": case "\x04":
          return done("quit");
        default:
          return; // ignore anything else and keep waiting
      }
    };
    stdin.on("data", onData);
  });
}

export function pagerAvailable(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY && typeof process.stdin.setRawMode === "function");
}

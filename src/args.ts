/** Tiny dependency-free argv parser. Supports --flag value, --flag=value, --no-flag, -f value. */
export type FlagValue = string | boolean;
export interface ParsedArgs {
  positional: string[];
  flags: Record<string, FlagValue>;
}

export interface ParseOptions {
  /** Flags that never take a value (so the next token stays positional). */
  booleans?: string[];
  /** Short → long alias map, e.g. { n: "per-page" }. */
  aliases?: Record<string, string>;
}

export function parseArgs(argv: string[], opts: ParseOptions = {}): ParsedArgs {
  const booleans = new Set(opts.booleans ?? []);
  const aliases = opts.aliases ?? {};
  const positional: string[] = [];
  const flags: Record<string, FlagValue> = {};

  const setFlag = (raw: string, value: FlagValue) => {
    flags[aliases[raw] ?? raw] = value;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const body = arg.slice(2);
      const eq = body.indexOf("=");
      if (eq !== -1) {
        setFlag(body.slice(0, eq), body.slice(eq + 1));
        continue;
      }
      if (body.startsWith("no-")) {
        setFlag(body.slice(3), false);
        continue;
      }
      const name = aliases[body] ?? body;
      const next = argv[i + 1];
      if (!booleans.has(name) && next !== undefined && !next.startsWith("-")) {
        setFlag(body, next);
        i++;
      } else {
        setFlag(body, true);
      }
      continue;
    }
    if (arg.startsWith("-") && arg.length > 1 && !/^-\d/.test(arg)) {
      const short = arg.slice(1);
      const name = aliases[short] ?? short;
      const next = argv[i + 1];
      if (!booleans.has(name) && next !== undefined && !next.startsWith("-")) {
        setFlag(short, next);
        i++;
      } else {
        setFlag(short, true);
      }
      continue;
    }
    positional.push(arg);
  }
  return { positional, flags };
}

export function str(v: FlagValue | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export function int(v: FlagValue | undefined, fallback: number): number {
  if (typeof v !== "string") return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function bool(v: FlagValue | undefined, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v !== "false" && v !== "0";
  return fallback;
}

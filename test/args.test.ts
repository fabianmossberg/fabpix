import { describe, expect, test } from "bun:test";
import { parseArgs, int, bool, str } from "../src/args.ts";

const opts = { booleans: ["json", "preview"], aliases: { n: "per-page", p: "page" } };

describe("parseArgs", () => {
  test("positional and long flags with values", () => {
    const r = parseArgs(["search", "mountain", "lake", "--per-page", "5", "--page=2"], opts);
    expect(r.positional).toEqual(["search", "mountain", "lake"]);
    expect(r.flags["per-page"]).toBe("5");
    expect(r.flags.page).toBe("2");
  });

  test("short aliases map to long names", () => {
    const r = parseArgs(["curated", "-n", "20", "-p", "3"], opts);
    expect(r.flags["per-page"]).toBe("20");
    expect(r.flags.page).toBe("3");
  });

  test("boolean flags do not swallow the next positional", () => {
    const r = parseArgs(["search", "--json", "cats"], opts);
    expect(r.flags.json).toBe(true);
    expect(r.positional).toEqual(["search", "cats"]);
  });

  test("--no-flag negates", () => {
    const r = parseArgs(["search", "cats", "--no-preview"], opts);
    expect(r.flags.preview).toBe(false);
  });

  test("everything after -- is positional", () => {
    const r = parseArgs(["search", "--", "--weird", "query"], opts);
    expect(r.positional).toEqual(["search", "--weird", "query"]);
  });

  test("negative numbers are positional, not flags", () => {
    const r = parseArgs(["x", "-5"], opts);
    expect(r.positional).toEqual(["x", "-5"]);
  });

  test("coercion helpers", () => {
    expect(int("12", 1)).toBe(12);
    expect(int("nope", 7)).toBe(7);
    expect(int(undefined, 3)).toBe(3);
    expect(bool(undefined, true)).toBe(true);
    expect(bool("false", true)).toBe(false);
    expect(str(true)).toBeUndefined();
    expect(str("a")).toBe("a");
  });
});

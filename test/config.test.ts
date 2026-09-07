import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  coerceValue, findProjectSource, loadSettings, mergeSettings, readSource, resolveApiKey, setPath, getPath,
} from "../src/config.ts";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "fabpix-cfg-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const env = () => ({ XDG_CONFIG_HOME: join(root, "xdg") });

describe("findProjectSource", () => {
  test("walks upward and prefers .fabpixrc over package.json", () => {
    const proj = join(root, "proj");
    const deep = join(proj, "src", "components");
    mkdirSync(deep, { recursive: true });
    writeFileSync(join(proj, "package.json"), JSON.stringify({ name: "x", fabpix: { pager: false } }));
    expect(findProjectSource(deep)?.path).toBe(join(proj, "package.json"));
    writeFileSync(join(proj, ".fabpixrc"), JSON.stringify({ pager: true }));
    expect(findProjectSource(deep)?.path).toBe(join(proj, ".fabpixrc"));
  });
  test("ignores package.json without a fabpix key", () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "x" }));
    expect(findProjectSource(root)).toBeUndefined();
  });
});

describe("readSource", () => {
  test("resolves a relative download.dir against the file's folder and expands ~", () => {
    const file = join(root, "fabpix.json");
    writeFileSync(file, JSON.stringify({ download: { dir: "./assets/photos" } }));
    expect(readSource({ path: file, scope: "project" }).download?.dir).toBe(join(root, "assets", "photos"));
    writeFileSync(file, JSON.stringify({ download: { dir: "~/Pictures" } }));
    expect(readSource({ path: file, scope: "project" }).download?.dir?.startsWith("/")).toBe(true);
    expect(readSource({ path: file, scope: "project" }).download?.dir?.endsWith("/Pictures")).toBe(true);
  });
  test("accepts the legacy defaultProvider key", () => {
    const file = join(root, ".fabpixrc");
    writeFileSync(file, JSON.stringify({ defaultProvider: "pexels" }));
    expect(readSource({ path: file, scope: "project" })).toEqual({ provider: "pexels" });
  });
});

describe("loadSettings precedence", () => {
  test("project overrides global per key, sections merge", () => {
    const xdg = join(root, "xdg", "fabpix");
    mkdirSync(xdg, { recursive: true });
    writeFileSync(join(xdg, "config.json"), JSON.stringify({
      provider: "pexels", providers: { pexels: { apiKey: "GLOBALKEY" } },
      preview: { rows: 8, cols: 24, layout: "grid" }, download: { size: "original" },
    }));
    const proj = join(root, "proj"); mkdirSync(proj);
    writeFileSync(join(proj, ".fabpixrc"), JSON.stringify({ preview: { layout: "list" }, download: { dir: "./img" } }));

    const { settings, sources } = loadSettings(proj, env());
    expect(sources.map((s) => s.scope)).toEqual(["global", "project"]);
    expect(settings.preview).toEqual({ rows: 8, cols: 24, layout: "list" });
    expect(settings.download).toEqual({ size: "original", dir: join(proj, "img") });
    expect(resolveApiKey("pexels", settings, {})).toBe("GLOBALKEY");
    expect(resolveApiKey("pexels", settings, { PEXELS_API_KEY: "ENVKEY" })).toBe("ENVKEY");
  });
  test("no files → empty settings", () => {
    expect(loadSettings(root, env())).toEqual({ settings: {}, sources: [] });
  });
  test("malformed file gives a readable error", () => {
    writeFileSync(join(root, ".fabpixrc"), "{ nope");
    expect(() => loadSettings(root, env())).toThrow(/Could not parse/);
  });
});

describe("helpers", () => {
  test("mergeSettings keeps unrelated sections", () => {
    expect(mergeSettings({ pager: true, search: { perPage: 5 } }, { search: { locale: "sv-SE" } }))
      .toMatchObject({ pager: true, search: { perPage: 5, locale: "sv-SE" } });
  });
  test("coerceValue", () => {
    expect(coerceValue("true")).toBe(true);
    expect(coerceValue("12")).toBe(12);
    expect(coerceValue("./assets")).toBe("./assets");
    expect(coerceValue('{"a":1}')).toEqual({ a: 1 });
  });
  test("setPath / getPath with dotted keys, undefined deletes", () => {
    const o: Record<string, unknown> = {};
    setPath(o, "download.dir", "./x");
    setPath(o, "preview.rows", 6);
    expect(getPath(o, "download.dir")).toBe("./x");
    setPath(o, "download.dir", undefined);
    expect(o).toEqual({ download: {}, preview: { rows: 6 } });
  });
});

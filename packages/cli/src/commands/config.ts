import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { bold, dim, green, yellow } from "../render/style.ts";
import { coerceValue, findProjectSource, getPath, globalCandidates, globalConfigPath, loadSettings, readSourceOrEmpty, setPath, writeSource, PROJECT_FILES, TEMPLATE, type Scope, type SettingsSource, ProviderError } from "@fabianmossberg/fabpix-core";

const out = (s: string) => process.stdout.write(s + "\n");

function pretty(path: string): string {
  const rel = relative(process.cwd(), path);
  return rel && !rel.startsWith("..") ? "./" + rel : path.replace(process.env.HOME ?? "\0", "~");
}

/** Which file a write should go to. */
function targetFor(scope: Scope): SettingsSource {
  if (scope === "global") return { path: globalConfigPath(), scope };
  return findProjectSource(process.cwd()) ?? { path: join(process.cwd(), PROJECT_FILES[0]), scope: "project" };
}

export function configShow(): void {
  const { settings, sources } = loadSettings();
  if (sources.length === 0) out(dim("no settings files found; using built-in defaults"));
  for (const s of sources) out(dim(`${s.scope.padEnd(7)} `) + pretty(s.path) + (s.key ? dim(` (key "${s.key}")`) : ""));
  const redacted = JSON.parse(JSON.stringify(settings)) as Record<string, unknown>;
  for (const p of Object.values((redacted.providers as Record<string, { apiKey?: string }>) ?? {})) {
    if (p.apiKey) p.apiKey = p.apiKey.slice(0, 4) + "…" + p.apiKey.slice(-4);
  }
  out("");
  out(JSON.stringify(redacted, null, 2));
}

export function configPaths(): void {
  out(bold("global") + dim("  (first existing one is used)"));
  for (const p of globalCandidates()) out(`  ${existsSync(p) ? green("●") : dim("○")} ${pretty(p)}`);
  out(bold("project") + dim("  (nearest, searching upward from the current folder)"));
  const found = findProjectSource(process.cwd());
  out(`  ${found ? green("● ") + pretty(found.path) + (found.key ? dim(` (key "${found.key}")`) : "") : dim("○ none")}`);
  out(dim(`  looks for: ${PROJECT_FILES.join(", ")}, package.json { "fabpix": {…} }`));
}

export function configInit(scope: Scope, force: boolean): void {
  const target = scope === "global"
    ? { path: globalConfigPath(), scope }
    : { path: join(process.cwd(), PROJECT_FILES[0]), scope };
  if (existsSync(target.path) && !force) {
    throw new ProviderError(`${pretty(target.path)} already exists.`, "Use --force to overwrite it.");
  }
  const existing = force ? {} : readSourceOrEmpty(target);
  writeSource(target, { ...TEMPLATE, ...existing });
  out(green("wrote ") + pretty(target.path));
  if (scope === "project") out(dim("relative download.dir resolves against this file's folder"));
}

export function configGet(key: string): void {
  const { settings } = loadSettings();
  const value = getPath(settings, key);
  if (value === undefined) {
    process.exitCode = 1;
    return;
  }
  out(typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

export function configSet(key: string, rawValue: string | undefined, scope: Scope): void {
  const target = targetFor(scope);
  const current = readSourceOrEmpty(target) as Record<string, unknown>;
  const value = rawValue === undefined ? undefined : coerceValue(rawValue);
  setPath(current, key, value);
  writeSource(target, current);
  if (value === undefined) out(yellow("unset ") + key + dim(` in ${pretty(target.path)}`));
  else out(green("set ") + `${key} = ${JSON.stringify(value)}` + dim(` in ${pretty(target.path)}`));
  if (key.includes("apiKey") && scope === "project") {
    out(yellow("warning: ") + "an API key in a project file is easy to commit by accident; prefer `fabpix auth set` (global).");
  }
}

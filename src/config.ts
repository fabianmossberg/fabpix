import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, isAbsolute } from "node:path";

/**
 * fabpix settings. Every key is optional; CLI flags override everything here.
 *
 * Precedence (highest first):
 *   1. command-line flags
 *   2. environment (FABPIX_PEXELS_KEY, PEXELS_API_KEY, FABPIX_PROTOCOL)
 *   3. nearest project file, searched upward from the working directory:
 *        .fabpixrc  ·  .fabpixrc.json  ·  fabpix.json  ·  package.json { "fabpix": {…} }
 *   4. global file: $XDG_CONFIG_HOME/fabpix/config.json (default ~/.config/fabpix/config.json)
 *      or ~/.fabpixrc
 */
export interface Settings {
  /** Default provider name, e.g. "pexels". */
  provider?: string;
  providers?: Record<string, { apiKey?: string }>;
  preview?: {
    /** Set false for text-only output. */
    enabled?: boolean;
    layout?: "grid" | "list";
    /** Force a renderer instead of auto-detecting. */
    protocol?: "iterm" | "kitty" | "chafa" | "none";
    rows?: number;
    cols?: number;
    /** Box size for `show`. */
    showRows?: number;
    showCols?: number;
  };
  search?: {
    perPage?: number;
    orientation?: "landscape" | "portrait" | "square";
    /** Minimum size hint passed to the provider. */
    size?: string;
    locale?: string;
    color?: string;
  };
  download?: {
    /** Directory for downloads. Relative paths resolve against the config file's folder. */
    dir?: string;
    /** Size variant, e.g. "large2x" or "original". */
    size?: string;
    overwrite?: boolean;
  };
  /** Interactive paging in a terminal. */
  pager?: boolean;
}

export type Scope = "global" | "project";

export interface SettingsSource {
  path: string;
  scope: Scope;
  /** For package.json the settings live under a key. */
  key?: string;
}

export interface LoadedSettings {
  settings: Settings;
  sources: SettingsSource[];
}

export const PROJECT_FILES = [".fabpixrc", ".fabpixrc.json", "fabpix.json"] as const;
export const PACKAGE_JSON_KEY = "fabpix";

export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  const xdg = env.XDG_CONFIG_HOME;
  return join(xdg && xdg.length > 0 ? xdg : join(homedir(), ".config"), "fabpix");
}

/** The global file we write to (and the first one we read). */
export function globalConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(configDir(env), "config.json");
}

export function globalCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  return [globalConfigPath(env), join(homedir(), ".fabpixrc")];
}

export function expandHome(p: string): string {
  return p === "~" ? homedir() : p.startsWith("~/") ? join(homedir(), p.slice(2)) : p;
}

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Find the nearest project settings file, walking up from `cwd`. */
export function findProjectSource(cwd: string): SettingsSource | undefined {
  let dir = resolve(cwd);
  for (;;) {
    for (const name of PROJECT_FILES) {
      const path = join(dir, name);
      if (existsSync(path)) return { path, scope: "project" };
    }
    const pkg = join(dir, "package.json");
    if (existsSync(pkg)) {
      try {
        const data = readJsonFile(pkg) as Record<string, unknown>;
        if (data && typeof data[PACKAGE_JSON_KEY] === "object") return { path: pkg, scope: "project", key: PACKAGE_JSON_KEY };
      } catch {
        /* malformed package.json: ignore, keep walking */
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export function readSource(source: SettingsSource): Settings {
  const data = readJsonFile(source.path) as Record<string, unknown>;
  const raw = (source.key ? data[source.key] : data) as Settings & { defaultProvider?: string };
  const settings: Settings = { ...raw };
  // Back-compat with the first config format.
  if (raw.defaultProvider && !settings.provider) settings.provider = raw.defaultProvider;
  delete (settings as { defaultProvider?: string }).defaultProvider;
  // A relative download dir means "relative to this file", not to wherever fabpix is run.
  if (settings.download?.dir) {
    const dir = expandHome(settings.download.dir);
    settings.download = { ...settings.download, dir: isAbsolute(dir) ? dir : resolve(dirname(source.path), dir) };
  }
  return settings;
}

/** Shallow-merge per section so a project file can override one key without repeating the rest. */
export function mergeSettings(base: Settings, over: Settings): Settings {
  return {
    ...base,
    ...over,
    providers: { ...base.providers, ...over.providers },
    preview: { ...base.preview, ...over.preview },
    search: { ...base.search, ...over.search },
    download: { ...base.download, ...over.download },
  };
}

export function loadSettings(cwd: string = process.cwd(), env: NodeJS.ProcessEnv = process.env): LoadedSettings {
  const sources: SettingsSource[] = [];
  let settings: Settings = {};

  const globalPath = globalCandidates(env).find((p) => existsSync(p));
  if (globalPath) {
    const src: SettingsSource = { path: globalPath, scope: "global" };
    try {
      settings = mergeSettings(settings, readSource(src));
      sources.push(src);
    } catch (err) {
      throw new Error(`Could not parse ${globalPath}: ${(err as Error).message}`);
    }
  }
  const project = findProjectSource(cwd);
  if (project) {
    try {
      settings = mergeSettings(settings, readSource(project));
      sources.push(project);
    } catch (err) {
      throw new Error(`Could not parse ${project.path}: ${(err as Error).message}`);
    }
  }
  return { settings, sources };
}

/** Write settings to a file, preserving a package.json wrapper if that's the target. */
export function writeSource(source: SettingsSource, settings: Settings): void {
  mkdirSync(dirname(source.path), { recursive: true });
  if (source.key) {
    const data = existsSync(source.path) ? (readJsonFile(source.path) as Record<string, unknown>) : {};
    data[source.key] = settings;
    writeFileSync(source.path, JSON.stringify(data, null, 2) + "\n");
    return;
  }
  writeFileSync(source.path, JSON.stringify(settings, null, 2) + "\n", { mode: source.scope === "global" ? 0o600 : 0o644 });
}

/** Read a single source file's raw settings (no merging), or {} if absent. */
export function readSourceOrEmpty(source: SettingsSource): Settings {
  try {
    const data = readJsonFile(source.path) as Record<string, unknown>;
    return ((source.key ? data[source.key] : data) as Settings) ?? {};
  } catch {
    return {};
  }
}

/**
 * Resolve an API key for a provider. Precedence:
 *   FABPIX_<PROVIDER>_KEY  →  <PROVIDER>_API_KEY  →  settings
 */
export function resolveApiKey(provider: string, settings: Settings, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const upper = provider.toUpperCase();
  return env[`FABPIX_${upper}_KEY`] || env[`${upper}_API_KEY`] || settings.providers?.[provider]?.apiKey || undefined;
}

/** Dotted-path get/set helpers for `fabpix config set preview.layout list`. */
export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

export function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  let cur = obj;
  for (const k of keys.slice(0, -1)) {
    if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  const last = keys[keys.length - 1]!;
  if (value === undefined) delete cur[last];
  else cur[last] = value;
}

/** "true" → true, "8" → 8, '{"a":1}' → object, anything else stays a string. */
export function coerceValue(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  if (/^[[{"]/.test(raw)) {
    try { return JSON.parse(raw); } catch { /* fall through */ }
  }
  return raw;
}

export const TEMPLATE: Settings = {
  provider: "pexels",
  preview: { layout: "grid", rows: 8, cols: 24 },
  search: { perPage: 20 },
  download: { dir: "./assets/photos", size: "large2x", overwrite: false },
  pager: true,
};

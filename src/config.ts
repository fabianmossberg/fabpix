import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  defaultProvider?: string;
  providers?: Record<string, { apiKey?: string }>;
  preview?: { rows?: number; cols?: number; layout?: "grid" | "list" };
}

export function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  return join(xdg && xdg.length > 0 ? xdg : join(homedir(), ".config"), "fabpix");
}

export function configPath(): string {
  return join(configDir(), "config.json");
}

export function loadConfig(): Config {
  try {
    return JSON.parse(readFileSync(configPath(), "utf8")) as Config;
  } catch {
    return {};
  }
}

export function saveConfig(config: Config): void {
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
}

/**
 * Resolve an API key for a provider. Precedence:
 *   FABPIX_<PROVIDER>_KEY  →  <PROVIDER>_API_KEY  →  config file
 */
export function resolveApiKey(provider: string, config: Config = loadConfig()): string | undefined {
  const upper = provider.toUpperCase();
  return (
    process.env[`FABPIX_${upper}_KEY`] ||
    process.env[`${upper}_API_KEY`] ||
    config.providers?.[provider]?.apiKey ||
    undefined
  );
}

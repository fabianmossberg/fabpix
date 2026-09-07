import { bold, dim, green, red } from "../render/style.ts";
import { loadSettings, resolveApiKey, globalConfigPath, readSourceOrEmpty, writeSource, getProvider, providerNames, ProviderError } from "@fabianmossberg/fabpix-core";

export function authSet(provider: string, key: string): void {
  if (!providerNames().includes(provider)) {
    throw new ProviderError(`Unknown provider "${provider}".`, `Available: ${providerNames().join(", ")}`);
  }
  const target = { path: globalConfigPath(), scope: "global" as const };
  const settings = readSourceOrEmpty(target);
  settings.providers ??= {};
  settings.providers[provider] = { ...settings.providers[provider], apiKey: key };
  writeSource(target, settings);
  process.stdout.write(green("saved ") + `${provider} key to ${target.path}\n`);
}

export async function authStatus(providerName: string): Promise<void> {
  const { settings, sources } = loadSettings();
  const key = resolveApiKey(providerName, settings);
  const source =
    process.env[`FABPIX_${providerName.toUpperCase()}_KEY`] ? "env FABPIX_" + providerName.toUpperCase() + "_KEY"
    : process.env[`${providerName.toUpperCase()}_API_KEY`] ? "env " + providerName.toUpperCase() + "_API_KEY"
    : process.env[`${providerName.toUpperCase()}_ACCESS_KEY`] ? "env " + providerName.toUpperCase() + "_ACCESS_KEY"
    : settings.providers?.[providerName]?.apiKey ? (sources.map((s) => s.path).join(" / ") || "settings")
    : undefined;

  process.stdout.write(bold(providerName) + "\n");
  if (!key) {
    const flag = providerName === "pexels" ? "" : ` --provider ${providerName}`;
    process.stdout.write(red("  no API key configured") + "\n" + dim(`  run: fabpix auth set <key>${flag}`) + "\n");
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`  key     ${key.slice(0, 4)}…${key.slice(-4)}  ${dim("from " + source)}\n`);
  try {
    const provider = getProvider({ name: providerName, settings, ttlMs: 0 });
    await provider.curated({ perPage: 1 });
    process.stdout.write(green("  valid") + "\n");
  } catch (err) {
    process.stdout.write(red("  invalid: ") + (err instanceof Error ? err.message : String(err)) + "\n");
    process.exitCode = 1;
  }
}

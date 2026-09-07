import { loadConfig, saveConfig, resolveApiKey, configPath } from "../config.ts";
import { getProvider, providerNames } from "../providers/index.ts";
import { ProviderError } from "../providers/types.ts";
import { bold, dim, green, red } from "../render/style.ts";

export function authSet(provider: string, key: string): void {
  if (!providerNames().includes(provider)) {
    throw new ProviderError(`Unknown provider "${provider}".`, `Available: ${providerNames().join(", ")}`);
  }
  const config = loadConfig();
  config.providers ??= {};
  config.providers[provider] = { ...config.providers[provider], apiKey: key };
  saveConfig(config);
  process.stdout.write(green("saved ") + `${provider} key to ${configPath()}\n`);
}

export async function authStatus(providerName: string): Promise<void> {
  const config = loadConfig();
  const key = resolveApiKey(providerName, config);
  const source =
    process.env[`FABPIX_${providerName.toUpperCase()}_KEY`] ? "env FABPIX_" + providerName.toUpperCase() + "_KEY"
    : process.env[`${providerName.toUpperCase()}_API_KEY`] ? "env " + providerName.toUpperCase() + "_API_KEY"
    : config.providers?.[providerName]?.apiKey ? configPath()
    : undefined;

  process.stdout.write(bold(providerName) + "\n");
  if (!key) {
    process.stdout.write(red("  no API key configured") + "\n" + dim("  run: fabpix auth set <key>") + "\n");
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`  key     ${key.slice(0, 4)}…${key.slice(-4)}  ${dim("from " + source)}\n`);
  try {
    const provider = getProvider({ name: providerName, config, ttlMs: 0 });
    await provider.curated({ perPage: 1 });
    process.stdout.write(green("  valid") + "\n");
  } catch (err) {
    process.stdout.write(red("  invalid: ") + (err instanceof Error ? err.message : String(err)) + "\n");
    process.exitCode = 1;
  }
}

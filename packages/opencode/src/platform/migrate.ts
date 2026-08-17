import { fileURLToPath } from "node:url";

import { configurePlugins, ConfigDirectories, patch, type Config } from "./config";

export async function deforge(config: Config): Promise<Config> {
  config.agent = config.agent || {};
  config.provider = config.provider || {};
  config.permission = config.permission || {};
  config.mcp = config.mcp || {};

  // Remove Forge provider, models, and agents
  if (config.provider.openrouter?.name?.includes("Forge")) {
    delete config.provider.openrouter;

    if (config.model?.startsWith("openrouter/")) {
      delete config.model;
    }

    if (config.small_model?.startsWith("openrouter/")) {
      delete config.small_model;
    }

    for (const agent of Object.keys(config.agent)) {
      if (config.agent[agent]?.model?.startsWith("openrouter")) {
        delete config.agent[agent];
      }
    }
  }

  // Remove Forge permissions
  for (const permission in config.permission) {
    if (permission.startsWith("forge_")) {
      delete config.permission[permission];
    }
  }

  // Remove Forge MCP
  if (config.mcp?.forge) {
    delete config.mcp.forge;
  }

  // Restore `enabled_providers` if locked to only "openrouter"
  if (
    Array.isArray(config.enabled_providers) &&
    config.enabled_providers.includes("openrouter") &&
    config.enabled_providers.length === 1
  ) {
    delete config.enabled_providers;
  }

  return config;
}

export const deforgeTuiPlugins = [
  "forge-tui",
  "open-web",
  "progress-relay",
  "done-notifier",
  "token-tracker",
];

export async function deforgeTui(config: Config): Promise<Config> {
  config.plugin = configurePlugins(
    config.plugin || [],
    Object.fromEntries(deforgeTuiPlugins.map((plugin) => [`./plugins/${plugin}.tsx`, false])),
  );
  return config;
}

export async function migrate(location: string = ConfigDirectories.global) {
  return await Promise.all([
    patch(location, "opencode", deforge),
    patch(location, "tui", deforgeTui),
  ]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await migrate();
}

import type { Hooks } from "@opencode-ai/plugin";

import type { Integration } from "#plugin/integrations/types";

import { deforge, deforgeTuiPlugins, migrate } from "#platform/migrate";

type MigrationRunner = () => Promise<void>;

export function migrationHooks(
  run: MigrationRunner = async () => {
    await migrate();
  },
): Hooks {
  return {
    config: async (config) => {
      await deforge(config);
    },
    event: async ({ event }) => {
      if (event.type === "server.connected") await run();
    },
  };
}

export const MigrationIntegration: Integration = async () => ({
  server: async () => migrationHooks(),
  tui: async (api) => {
    const plugins = api.plugins
      .list()
      .filter((plugin) =>
        deforgeTuiPlugins.some(
          (name) => plugin.spec.includes(name) || plugin.target.includes(name),
        ),
      );
    await Promise.all(plugins.map((plugin) => api.plugins.deactivate(plugin.id)));
    return {};
  },
});

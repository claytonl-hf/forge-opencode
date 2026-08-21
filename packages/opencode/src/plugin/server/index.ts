import type { Plugin, PluginModule } from "@opencode-ai/plugin";

import { createForge } from "@forge/core";

import { useIntegrations } from "#plugin/integrations/registry";
import { useForgeOptions } from "#plugin/options";

export async function server(input: Parameters<Plugin>[0]): ReturnType<Plugin> {
  const { client, directory } = input;
  try {
    const [forge, options] = await Promise.all([createForge(), useForgeOptions(directory)]);
    const integrations = await useIntegrations(forge, options);

    return integrations.server(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Forge plugin error:", message);
    await client.app
      .log({
        body: {
          service: "forge",
          level: "error",
          message,
        },
      })
      .catch(() => {
        // Ignore logging errors
      });
  }

  return {};
}

const plugin: PluginModule = {
  id: "forge",
  server,
};

export default plugin;

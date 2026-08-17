import type { Plugin, PluginModule } from "@opencode-ai/plugin";

import { createForge } from "@forge/core";

import { useIntegrations } from "../integrations/registry";
import { useForgeOptions } from "../options";

export const server: Plugin = async (input) => {
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
};

const plugin: PluginModule = {
  id: "forge",
  server,
};

export default plugin;

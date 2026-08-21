import { join } from "node:path";

import type { Integration } from "#plugin/integrations/types";

import { PackageRoot, type Config } from "#platform/config";

export const ToolsIntegration: Integration = async (forge) => {
  const mcp = await forge.mcp();

  return {
    server: async () => ({
      config: async (config: Config) => {
        if (mcp) {
          config.mcp ??= {};
          config.mcp.forge = mcp;
        }

        config.command = {
          ...config.command,
          ...(await forge.commands().catch(() => ({}))),
        };
        config.skills = {
          ...config.skills,
          paths: [...(config.skills?.paths ?? []), join(PackageRoot, "resources", "skills")],
        };
      },
    }),
  };
};

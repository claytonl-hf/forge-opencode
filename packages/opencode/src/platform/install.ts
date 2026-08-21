import { createVersion } from "@forge/core/utils";
import { execa } from "execa";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";

import { Profiles } from "#features/profiles/presets";
import { ForgeDefaultOptions, type ForgeOptions } from "#plugin/options";

import { ConfigDirectories, patch, PackageRoot, configurePlugins } from "./config";

export const MinimumVersion = "1.18.0";

export async function version() {
  try {
    const { stdout } = await execa({ env: { BUN_BE_BUN: "0" } })`opencode --version`;

    return createVersion(stdout.trim());
  } catch {
    return null;
  }
}

export async function install(options?: {
  location?: string;
  profiles?: boolean;
  mcp?: boolean;
  plugins?: boolean;
}) {
  const location = options?.location ?? ConfigDirectories.global;
  const ForgePlugin = relative(location, PackageRoot);
  const results = await Promise.all([
    patch(location, "opencode", async (config) => {
      config.plugin = configurePlugins(config.plugin ?? [], {
        ...(options?.plugins
          ? {
              "@plannotator/opencode@0.26.2": {
                workflow: "all-agents",
                planningAgents: ["plan"],
              },
            }
          : undefined),
        [ForgePlugin]: {},
      });

      if (options?.mcp) {
        config.mcp = {
          context7: {
            type: "remote",
            url: "https://mcp.context7.com/mcp",
            enabled: true,
            oauth: false,
            headers: {
              CONTEXT7_API_KEY: "{env:CONTEXT7_API_KEY}",
            },
          },
          gh_grep: {
            type: "remote",
            url: "https://mcp.grep.app",
            enabled: true,
            oauth: false,
          },
          websearch: {
            type: "remote",
            url: "https://mcp.exa.ai/mcp?tools=web_search_exa&exaApiKey={env:EXA_API_KEY}",
            enabled: true,
            oauth: false,
          },
          ...config.mcp,
        };
      }

      return config;
    }),
    patch(location, "tui", async (config) => {
      config.plugin = configurePlugins(config.plugin ?? [], {
        [ForgePlugin]: {},
      });

      return config;
    }),
    patch<ForgeOptions>(
      location,
      "forge",
      async (config) => {
        config = {
          ...ForgeDefaultOptions,
          ...config,
        };

        if (options?.profiles) {
          config.profiles = {
            ...config.profiles,
            ...Profiles,
          };
        }

        return config;
      },
      true,
    ),
  ]);

  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await install();
}

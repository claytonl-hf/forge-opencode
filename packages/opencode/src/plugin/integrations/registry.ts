import type Forge from "@forge/core";
import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";

import type { UseForgeOptions } from "../options";
import type { TuiOutput } from "./types";

import { BrandIntegration } from "../../features/brand/integration";
import { MigrationIntegration } from "../../features/migration/integration";
import { ModelsIntegration } from "../../features/models/integration";
import { NotifierIntegration } from "../../features/notifier/integration";
import { ProfileIntegration } from "../../features/profiles/integration";
import { ToolsIntegration } from "../../features/tools/integration";
import { UsageIntegration } from "../../features/usage/integration";
import { WebIntegration } from "../../features/web/integration";
import { WorkerIntegration } from "../../features/workers/integration";
import { createHooks } from "../server/hooks";

export async function useIntegrations(forge: Forge, options: UseForgeOptions) {
  const integrations = await Promise.all([
    BrandIntegration(forge, options),
    MigrationIntegration(forge, options),
    ModelsIntegration(forge, options),
    NotifierIntegration(forge, options),
    ProfileIntegration(forge, options),
    ToolsIntegration(forge, options),
    UsageIntegration(forge, options),
    WebIntegration(forge, options),
    WorkerIntegration(forge, options),
  ]);

  return {
    async server(input: PluginInput): Promise<Hooks> {
      const hooks = await Promise.all(
        integrations.flatMap((integration) =>
          integration.server ? [integration.server(input)] : [],
        ),
      );
      return createHooks(hooks);
    },

    async tui(api: TuiPluginApi): Promise<TuiOutput> {
      const output: TuiOutput = { commands: [], slots: [] };
      const contributions = await Promise.all(
        integrations.flatMap((integration) => (integration.tui ? [integration.tui(api)] : [])),
      );
      for (const contribution of contributions) {
        output.commands.push(...(contribution.commands ?? []));
        output.slots.push(contribution.slots ?? {});
      }
      return output;
    },
  };
}

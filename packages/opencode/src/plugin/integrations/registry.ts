import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";

import type { PluginContext } from "#plugin/context";

import { BrandIntegration } from "#features/brand/integration";
import { MigrationIntegration } from "#features/migration/integration";
import { ModelsIntegration } from "#features/models/integration";
import { NotifierIntegration } from "#features/notifier/integration";
import { ProfileIntegration } from "#features/profiles/integration";
import { ToolsIntegration } from "#features/tools/integration";
import { UsageIntegration } from "#features/usage/integration";
import { WebIntegration } from "#features/web/integration";
import { WorkerIntegration } from "#features/workers/integration";
import { createHooks } from "#plugin/server/hooks";

import type { TuiOutput } from "./types";

export async function useIntegrations(ctx: PluginContext) {
  const integrations = await Promise.all([
    BrandIntegration(ctx),
    MigrationIntegration(ctx),
    ModelsIntegration(ctx),
    NotifierIntegration(ctx),
    ProfileIntegration(ctx),
    ToolsIntegration(ctx),
    UsageIntegration(ctx),
    WebIntegration(ctx),
    WorkerIntegration(ctx),
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

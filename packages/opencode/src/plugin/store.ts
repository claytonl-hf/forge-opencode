import type Forge from "@forge/core";
import type { ForgeModel, ForgeModels } from "@forge/core";

import type { SessionProfile } from "#features/profiles/profile";

import { createPolledResource, createResource } from "#plugin/resource";

export type PluginStoreEnv = {
  FORGE_USAGE_ALERT_BALANCE?: string;
};

type PluginModel = Pick<ForgeModel, "name" | "metadata">;

export function createPluginStore(
  forge: Pick<Forge, "models" | "usage">,
  env: PluginStoreEnv = process.env,
) {
  const catalog = createResource<ForgeModels>();
  const usage = createPolledResource(() => forge.usage());
  const profile = createResource<SessionProfile>();

  return {
    env: {
      FORGE_USAGE_ALERT_BALANCE: env.FORGE_USAGE_ALERT_BALANCE,
    },
    session: {
      profile,
    },
    models: {
      get: catalog.get,
      refresh: () => catalog.load(() => forge.models()),
      getModel(id: string): PluginModel | undefined {
        const models = catalog.get();
        const model = models?.[id] ?? (id.startsWith("forge/") ? models?.[id.slice(6)] : undefined);
        return model ? { name: model.name, metadata: model.metadata } : undefined;
      },
    },
    usage,
  };
}

export type PluginStore = ReturnType<typeof createPluginStore>;

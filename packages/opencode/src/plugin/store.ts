import type Forge from "@forge/core";
import type { ForgeModel, ForgeModels } from "@forge/core";

import { createPolledResource, createResource } from "#plugin/resource";

type SessionProfile = string | null | undefined;

type PluginModel = Pick<ForgeModel, "name" | "metadata">;

export function createPluginStore(forge: Pick<Forge, "models" | "usage">) {
  const catalog = createResource<ForgeModels>();
  const usage = createPolledResource(() => forge.usage());

  return {
    session: createResource<SessionProfile>(),
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

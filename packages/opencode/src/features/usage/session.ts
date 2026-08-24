import type { Hooks } from "@opencode-ai/plugin";

import type { PluginStore } from "#plugin/store";

import { blockMessage, isLowTierModel, shouldBlock } from "./gate";

export function createUsageSessionHooks(store: Pick<PluginStore, "usage" | "models">): Hooks {
  const gate = async (modelID: string | undefined) => {
    if (isLowTierModel(store.models, modelID) !== false) return;

    const usage = await store.usage.refresh();
    if (!usage) return;
    if (shouldBlock(usage)) throw new Error(blockMessage(usage));
  };

  return {
    "chat.message": async (input, output) => {
      const model = output.message.model ?? input.model;
      await gate(model?.providerID === "forge" ? model.modelID : undefined);
    },
    "chat.params": async (input) => {
      await gate(input.model.providerID === "forge" ? input.model.id : undefined);
    },
  };
}

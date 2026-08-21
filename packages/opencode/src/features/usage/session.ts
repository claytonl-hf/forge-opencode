import type Forge from "@forge/core";
import type { Hooks } from "@opencode-ai/plugin";

import { blockMessage, catalogTier, isAboveLow, shouldBlock, type CostTier } from "./gate";

export function createUsageSessionHooks(
  forge: Pick<Forge, "usage">,
  catalog: Awaited<ReturnType<Forge["models"]>>,
): Hooks {
  let usagePromise: ReturnType<Forge["usage"]> | undefined;

  const gate = async (tier: CostTier | undefined) => {
    if (!isAboveLow(tier)) return;

    if (!usagePromise) {
      usagePromise = forge.usage().finally(() => {
        usagePromise = undefined;
      });
    }

    const usage = await usagePromise;
    if (!usage) return;
    if (shouldBlock(usage)) throw new Error(blockMessage(usage));
  };

  return {
    "chat.message": async (input, output) => {
      const model = output.message.model ?? input.model;
      await gate(catalogTier(catalog, model?.providerID, model?.modelID));
    },
    "chat.params": async (input) => {
      await gate(catalogTier(catalog, input.model.providerID, input.model.id));
    },
  };
}

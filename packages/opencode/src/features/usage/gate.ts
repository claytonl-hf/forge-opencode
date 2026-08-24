import type { ForgeModelCostTier, ForgeModels, ForgeUsage } from "@forge/core";

import type { PluginStore } from "#plugin/store";

export const DEFAULT_THRESHOLD_USD = 2;

export function parseThreshold(value?: string): number {
  const threshold = value === undefined ? Number.NaN : parseFloat(value);
  return Number.isFinite(threshold) && threshold > 0 ? threshold : DEFAULT_THRESHOLD_USD;
}

export const dialogTitle = "You are almost out of Forge credits";

function costTier(value: string | undefined): ForgeModelCostTier | undefined {
  if (value === "low" || value === "mid" || value === "high") return value;
  return undefined;
}

export function isLowTierModel(
  models: PluginStore["models"],
  modelID: string | undefined,
): boolean | undefined {
  const tier = costTier(modelID ? models.getModel(modelID)?.metadata.cost.tier : undefined);
  if (!tier) return undefined;
  return tier === "low";
}

export function getLowTierModels(catalog: ForgeModels): { id: string; name: string }[] {
  return Object.entries(catalog)
    .filter(([, model]) => costTier(model.metadata.cost.tier) === "low")
    .map(([id, model]) => ({ id, name: model.name || id }))
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

export function dialogMessage(modelName: string, allowedNames: string[]): string {
  const message = `The requested model, ${modelName}, can no longer be used.`;
  if (allowedNames.length === 0) return message;

  return `${message} Switch to any of the following models: ${allowedNames.join(", ")}.`;
}

export function shouldBlock(
  usage: ForgeUsage | null | undefined,
  threshold = DEFAULT_THRESHOLD_USD,
): boolean {
  if (!usage) return false;

  return usage.budget.exhausted || usage.budget.remainingUsd <= threshold;
}

export function blockMessage(usage: ForgeUsage, threshold = DEFAULT_THRESHOLD_USD): string {
  const reset = usage.budget.resetAt ? ` Reset at ${usage.budget.resetAt}.` : "";
  return `Forge daily balance is $${usage.budget.remainingUsd.toFixed(2)}, at or below the $${threshold.toFixed(2)} threshold. Forge would silently route this request to a floor model.${reset}`;
}

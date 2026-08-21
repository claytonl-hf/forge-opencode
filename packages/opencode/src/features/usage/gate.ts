import type Forge from "@forge/core";

export const THRESHOLD_USD = parseFloat(process.env.FORGE_USAGE_ALERT_BALANCE || "2");

export type ForgeUsage = NonNullable<Awaited<ReturnType<Forge["usage"]>>>;
export type CostTier = "low" | "mid" | "high";

export const dialogTitle = "You are almost out of Forge credits";

function costTier(value: string): CostTier | undefined {
  if (value === "low" || value === "mid" || value === "high") return value;
  return undefined;
}

export function isAboveLow(tier: CostTier | undefined): boolean {
  return tier === "mid" || tier === "high";
}

export function catalogModel(
  catalog: Awaited<ReturnType<Forge["models"]>>,
  modelID: string | undefined,
) {
  if (!modelID) return undefined;

  return catalog[modelID] ?? (modelID.startsWith("forge/") ? catalog[modelID.slice(6)] : undefined);
}

export function catalogTier(
  catalog: Awaited<ReturnType<Forge["models"]>>,
  providerID: string | undefined,
  modelID: string | undefined,
): CostTier | undefined {
  if (providerID !== "forge" || !modelID) return undefined;

  return costTier(catalogModel(catalog, modelID)?.metadata.cost.tier ?? "");
}

export function lowTierModels(
  catalog: Awaited<ReturnType<Forge["models"]>>,
): { id: string; name: string }[] {
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
  threshold = THRESHOLD_USD,
): boolean {
  if (!usage) return false;

  return usage.budget.exhausted || usage.budget.remainingUsd <= threshold;
}

export function blockMessage(usage: ForgeUsage): string {
  const reset = usage.budget.resetAt ? ` Reset at ${usage.budget.resetAt}.` : "";
  return `Forge daily balance is $${usage.budget.remainingUsd.toFixed(2)}, at or below the $${THRESHOLD_USD.toFixed(2)} threshold. Forge would silently route this request to a floor model.${reset}`;
}

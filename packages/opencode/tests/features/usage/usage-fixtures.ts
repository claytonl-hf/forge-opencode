import type { ForgeModelCostTier, ForgeModels, ForgeUsage } from "@forge/core";

export function usage(
  remainingUsd: number,
  exhausted = false,
  resetAt = "2026-08-22T00:00:00Z",
): ForgeUsage {
  return {
    updatedAt: 0,
    catalogEpoch: 0,
    budget: {
      role: "user",
      dailyBudgetUsd: 10,
      spentUsdToday: 8,
      remainingUsd,
      dailyBudgetCredits: 1000,
      spentCreditsToday: 800,
      remainingCredits: remainingUsd * 100,
      maxBand: "$$",
      resetAt,
      currencyDayKey: "2026-08-21",
      spendIsPreview: false,
      warn80: false,
      exhausted,
      enforced: true,
      source: "test",
    },
  };
}

export function catalog(
  entries: Record<string, ForgeModelCostTier>,
  names: Record<string, string> = {},
) {
  const models: ForgeModels = {};

  for (const [id, tier] of Object.entries(entries)) {
    models[id] = {
      id,
      name: names[id] ?? id,
      description: "",
      attachment: false,
      reasoning: false,
      tool_call: true,
      release_date: "",
      last_updated: "",
      modalities: { input: ["text"], output: ["text"] },
      open_weights: false,
      limit: { context: 128_000, output: 16_384 },
      cost: { input: 0, output: 0 },
      metadata: {
        cost: { tier, band: "$" },
        speed: { rate: 1, tier: "fast" },
      },
    };
  }

  return models;
}

export function stub<Arguments extends unknown[], Result>(
  implementation: (...args: Arguments) => Result,
) {
  const calls: Arguments[] = [];

  return {
    calls,
    fn(...args: Arguments) {
      calls.push(args);
      return implementation(...args);
    },
  };
}

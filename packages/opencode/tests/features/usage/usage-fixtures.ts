import type Forge from "@forge/core";
import type { ForgeUsage } from "@forge/core";

import type { CostTier } from "../../../src/features/usage/gate";

type Catalog = Awaited<ReturnType<Forge["models"]>>;

export function usage(remainingUsd: number, exhausted = false, resetAt = "2026-08-22T00:00:00Z") {
  // SAFETY: Usage tests only read these budget fields from the otherwise valid Forge usage shape.
  return {
    budget: { remainingUsd, exhausted, resetAt },
  } as ForgeUsage;
}

export function catalog(entries: Record<string, CostTier>, names: Record<string, string> = {}) {
  // SAFETY: Usage tests only read these focused model metadata fields.
  return Object.fromEntries(
    Object.entries(entries).map(([id, tier]) => [
      id,
      { name: names[id] ?? id, metadata: { cost: { tier } } },
    ]),
  ) as Catalog;
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

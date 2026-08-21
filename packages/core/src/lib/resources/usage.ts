import { readFile } from "node:fs/promises";
import { z } from "zod";

import { exists } from "#lib/utils";

const ForgeUsageSchema = z.looseObject({
  updatedAt: z.number(),
  catalogEpoch: z.number(),
  budget: z.looseObject({
    role: z.string(),
    dailyBudgetUsd: z.number(),
    spentUsdToday: z.number(),
    remainingUsd: z.number(),
    dailyBudgetCredits: z.number(),
    spentCreditsToday: z.number(),
    remainingCredits: z.number(),
    maxBand: z.string(),
    resetAt: z.string(),
    currencyDayKey: z.string(),
    spendIsPreview: z.boolean(),
    warn80: z.boolean(),
    exhausted: z.boolean(),
    enforced: z.boolean(),
    source: z.string(),
  }),
});

export type ForgeUsage = z.infer<typeof ForgeUsageSchema>;

export async function getUsage(file: string) {
  if (!(await exists(file))) {
    return null;
  }

  try {
    const contents = await readFile(file, "utf-8");
    const value = JSON.parse(contents);

    return ForgeUsageSchema.parse(value);
  } catch {
    return null;
  }
}

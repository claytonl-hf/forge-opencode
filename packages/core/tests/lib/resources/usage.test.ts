import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { getUsage } from "#lib/resources/usage";

const directories: string[] = [];

async function fixture(contents: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "forge-usage-"));
  directories.push(directory);
  const file = join(directory, "usage.json");
  await writeFile(file, contents);
  return file;
}

const validUsage = {
  updatedAt: 1,
  catalogEpoch: 2,
  budget: {
    role: "developer",
    dailyBudgetUsd: 10,
    spentUsdToday: 2,
    remainingUsd: 8,
    dailyBudgetCredits: 1000,
    spentCreditsToday: 200,
    remainingCredits: 800,
    maxBand: "standard",
    resetAt: "2026-08-16T00:00:00Z",
    currencyDayKey: "2026-08-15",
    spendIsPreview: false,
    warn80: false,
    exhausted: false,
    enforced: true,
    source: "forge",
  },
};

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true })));
});

describe("getUsage", () => {
  test("parses a valid snapshot", async () => {
    const file = await fixture(JSON.stringify(validUsage));
    expect(await getUsage(file)).toEqual(validUsage);
  });

  test("returns null for a missing file", async () => {
    expect(await getUsage(join(tmpdir(), `missing-usage-${crypto.randomUUID()}`))).toBeNull();
  });

  test.each([
    ["invalid JSON", "{"],
    ["an invalid schema", JSON.stringify({ ...validUsage, updatedAt: "now" })],
  ])("returns null for %s", async (_, contents) => {
    expect(await getUsage(await fixture(contents))).toBeNull();
  });
});

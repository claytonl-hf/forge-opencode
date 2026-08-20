import { describe, expect, test } from "bun:test";

import { getModels, ModelsResponseSchema } from "../../src/lib/api/models";

function model() {
  return {
    id: "openai/gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    isDefault: true,
    limit: { context: 128_000, output: 8_192 },
    group: "openai",
    visionCapable: false,
    intelligence: 5,
    speedTier: "fast",
    tokensPerSec: 100,
    costTier: "low",
    band: "$",
    costInput: 1,
    costOutput: 2,
    contextLimit: 128_000,
    outputLimit: 8_192,
    tags: [],
    capabilities: ["text"],
    reasoningModes: ["none", "low", "medium", "high", "xhigh", "max"],
    reasoningDefault: "high",
  };
}

function models(models: unknown[]) {
  return ModelsResponseSchema.parse({
    source: "forge",
    localModelsMerged: true,
    reasoningEfforts: ["high"],
    opencode: { models, agents: [] },
    budget: {
      exhausted: false,
      spentUsd: 0,
      dailyBudgetUsd: 100,
      remainingUsd: 100,
      enforced: true,
    },
  }).opencode.models;
}

describe("getModels", () => {
  test("adds Forge metadata and reasoning options to known models", async () => {
    const result = await getModels(models([model()]));
    const item = result["openai/gpt-5.6-luna"];

    expect(item).toMatchObject({
      id: "openai/gpt-5.6-luna",
      name: "GPT-5.6 Luna",
      limit: { context: 128_000, output: 8_192 },
      cost: { input: 1, output: 2 },
      metadata: {
        cost: { tier: "low", band: "$" },
        speed: { rate: 100, tier: "fast" },
      },
      reasoning_options: [
        { type: "effort", values: ["none", "low", "medium", "high", "xhigh", "max"] },
      ],
    });
  });

  test("skips models that are not present in OpenRouter", async () => {
    const unknown = model();
    unknown.id = "unknown/provider-model";
    unknown.name = "Unknown Provider Model";
    const result = await getModels(models([unknown]));

    expect(result["unknown/provider-model"]).toBeUndefined();
  });
});

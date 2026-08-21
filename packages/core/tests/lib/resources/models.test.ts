import { describe, expect, test } from "vitest";

import { getModels } from "#lib/resources/models";

function model() {
  return {
    id: "openai/gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    isDefault: true,
    limit: { context: 128_000, output: 8_192 },
    group: "openai",
    visionCapable: false,
    intelligence: 5,
    speedTier: "fast" as const,
    tokensPerSec: 100,
    costTier: "low" as const,
    band: "$" as const,
    costInput: 1,
    costOutput: 2,
    contextLimit: 128_000,
    outputLimit: 8_192,
    tags: [],
    capabilities: ["text" as const],
    reasoningModes: [
      "none" as const,
      "low" as const,
      "medium" as const,
      "high" as const,
      "xhigh" as const,
      "max" as const,
    ],
    reasoningDefault: "high" as const,
  };
}

describe("getModels", () => {
  test("adds Forge metadata and reasoning options to known models", async () => {
    const result = await getModels([model()]);
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

  test("falls back to catalog data for models absent from OpenRouter", async () => {
    const unknown = model();
    unknown.id = "unknown/provider-model";
    unknown.name = "Unknown Provider Model";
    const result = await getModels([unknown]);

    expect(result["unknown/provider-model"]).toMatchObject({
      id: "unknown/provider-model",
      name: "Unknown Provider Model",
      description: "",
      release_date: "",
      last_updated: "",
      modalities: { input: ["text"], output: ["text"] },
      open_weights: false,
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
});

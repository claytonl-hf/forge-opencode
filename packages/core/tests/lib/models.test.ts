import { describe, expect, test } from "bun:test";

import { getModels } from "../../src/lib/models";

describe("getModels", () => {
  test("adds Forge reasoning variants to known models", async () => {
    const models = await getModels([
      { id: "openai/gpt-5.6-luna", name: "GPT-5.6 Luna" },
      { id: "anthropic/claude-opus-5", name: "Claude Opus 5" },
      { id: "deepseek/deepseek-v4-flash-0731", name: "DeepSeek V4 Flash" },
    ]);

    expect(models["openai/gpt-5.6-luna"]?.variants).toEqual({
      none: { reasoning: { effort: "none" } },
      low: { reasoning: { effort: "low" } },
      medium: { reasoning: { effort: "medium" } },
      high: { reasoning: { effort: "high" } },
      xhigh: { reasoning: { effort: "xhigh" } },
      max: { reasoning: { effort: "max" } },
    });
    expect(Object.keys(models["anthropic/claude-opus-5"]?.variants ?? {})).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
    expect(Object.keys(models["deepseek/deepseek-v4-flash-0731"]?.variants ?? {})).toEqual([
      "low",
      "high",
      "max",
    ]);
  });

  test("does not add variants to models without an explicit Forge mapping", async () => {
    const models = await getModels([{ id: "moonshotai/kimi-k2.7-code", name: "Kimi K2.7 Code" }]);

    expect(models["moonshotai/kimi-k2.7-code"]?.variants).toBeUndefined();
  });
});

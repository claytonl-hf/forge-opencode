import { describe, expect, test } from "bun:test";

import type { Config } from "../../src/platform/config";

import { deforge, deforgeTui, deforgeTuiPlugins } from "../../src/platform/migrate";

function config(value: Parameters<typeof deforge>[0]): Config {
  return value;
}

describe("deforge", () => {
  test("removes legacy Forge configuration and preserves unrelated configuration", async () => {
    const input = config({
      model: "openrouter/default",
      small_model: "openrouter/small",
      provider: {
        openrouter: { name: "Forge OpenRouter", models: {} },
        anthropic: { name: "Anthropic", models: {} },
      },
      agent: {
        legacy: { model: "openrouter/model", description: "Legacy" },
        custom: { model: "anthropic/model", description: "Custom" },
      },
      permission: { forge_write: "allow", edit: "ask" },
      mcp: {
        forge: { type: "remote", url: "https://forge.test" },
        other: { type: "remote", url: "https://other.test", enabled: true },
      },
      enabled_providers: ["openrouter"],
    });

    expect(await deforge(input)).toEqual(
      config({
        provider: { anthropic: { name: "Anthropic", models: {} } },
        agent: { custom: { model: "anthropic/model", description: "Custom" } },
        permission: { edit: "ask" },
        mcp: { other: { type: "remote", url: "https://other.test", enabled: true } },
      }),
    );
  });

  test("does not remove a non-Forge OpenRouter provider or its consumers", async () => {
    const input = config({
      model: "openrouter/default",
      small_model: "openrouter/small",
      provider: { openrouter: { name: "OpenRouter", models: {} } },
      agent: { custom: { model: "openrouter/model", description: "Custom" } },
      permission: {},
      mcp: {},
      enabled_providers: ["openrouter", "anthropic"],
    });

    expect(await deforge(input)).toEqual(input);
  });
});

describe("deforgeTui", () => {
  test("removes every legacy Forge TUI plugin and preserves unrelated plugins", async () => {
    const legacy = deforgeTuiPlugins.flatMap((name) => [
      `./plugins/${name}.tsx`,
      [`./plugins/${name}.tsx`, { enabled: true }] satisfies [string, { enabled: boolean }],
    ]);
    const input = config({
      plugin: [...legacy, ["unrelated@1.0.0", { retained: true }]],
    });

    expect(await deforgeTui(input)).toEqual({
      plugin: [["unrelated@1.0.0", { retained: true }]],
    });
  });
});

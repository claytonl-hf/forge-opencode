import type Forge from "@forge/core";
import type { Config } from "@opencode-ai/plugin";

import { describe, expect, test } from "bun:test";

import { ProfileIntegration } from "../../../src/features/profiles/integration";
import { ForgeOptions, type UseForgeOptions } from "../../../src/plugin/options";

describe("profile integration", () => {
  test("intentionally overrides configured model and variant while preserving other agent fields", async () => {
    // SAFETY: this focused Forge fake provides the only method ProfileIntegration uses.
    const forge = {
      provider: async () => ({ id: "forge" }),
    } as Forge;
    // SAFETY: the config hook reads options.value but never invokes update.
    const options = {
      value: ForgeOptions.parse({
        profile: "balanced",
        profiles: {
          balanced: {
            models: {
              $default: { id: "default" },
              $small: { id: "small" },
              reviewer: { id: "reviewer", variant: "high" },
              explorer: { id: "explorer", variant: null },
            },
          },
        },
      }),
    } as UseForgeOptions;
    const integration = await ProfileIntegration(forge, options);
    // SAFETY: this focused PluginInput fake provides the v1 session methods and server URL
    // required to build the profile hook adapter; this test only invokes the config hook.
    const hooks = await integration.server!({
      client: {
        session: {
          get: async () => ({ data: undefined }),
        },
      },
      directory: "/tmp",
      serverUrl: new URL("http://localhost:4096"),
    } as never);
    const config: Config = {
      model: "user/default",
      small_model: "user/small",
      agent: {
        reviewer: {
          description: "User reviewer",
          prompt: "Review",
          model: "user/reviewer",
          variant: "low",
          temperature: 0.7,
        },
        explorer: {
          description: "User explorer",
          prompt: "Explore",
          model: "user/explorer",
          variant: "medium",
        },
      },
    };

    await hooks.config!(config);

    expect(config.model).toBe("forge/default");
    expect(config.small_model).toBe("forge/small");
    expect(config.agent?.reviewer).toMatchObject({
      description: "User reviewer",
      prompt: "Review",
      model: "forge/reviewer",
      variant: "high",
      temperature: 0.7,
    });
    expect(config.agent?.explorer).toMatchObject({
      description: "User explorer",
      prompt: "Explore",
      model: "forge/explorer",
    });
    expect(config.agent?.explorer).not.toHaveProperty("variant");
  });
});

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
          update: async () => {},
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

  test("routes session-created model switches through the v2 client", async () => {
    const requests: Array<{ method: string; url: string }> = [];
    const originalFetch = globalThis.fetch;
    // SAFETY: this focused fetch fake preserves the global fetch signature and returns a valid Response.
    globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
      const [input, init] = args;
      const url =
        input instanceof URL ? input.toString() : input instanceof Request ? input.url : input;
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      requests.push({ method, url });
      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    try {
      // SAFETY: this focused Forge fake provides the only method ProfileIntegration uses.
      const forge = {
        provider: async () => ({ id: "forge" }),
      } as Forge;
      // SAFETY: the config hook reads options.value but never invokes update.
      const options = {
        value: ForgeOptions.parse({
          profile: "balanced",
          profiles: {
            balanced: { models: { $default: { id: "default" } } },
          },
        }),
      } as UseForgeOptions;
      const integration = await ProfileIntegration(forge, options);
      // SAFETY: this focused PluginInput fake provides the v1 session methods and server URL required here.
      const hooks = await integration.server!({
        client: {
          session: {
            get: async () => ({ data: undefined }),
            update: async () => {},
          },
        },
        directory: "/tmp",
        serverUrl: new URL("http://localhost:4096"),
      } as never);

      // SAFETY: this event payload contains the session.created fields consumed by the hook.
      await hooks.event?.({
        event: {
          type: "session.created",
          properties: {
            info: { id: "session", agent: "reviewer", metadata: {} },
          },
        },
      } as never);

      expect(requests).toHaveLength(1);
      expect(requests[0]?.method).toBe("POST");
      expect(new URL(requests[0]!.url).pathname).toMatch(/\/session\/session\/model$/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

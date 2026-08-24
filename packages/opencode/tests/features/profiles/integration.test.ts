import type Forge from "@forge/core";
import type { Config } from "@opencode-ai/plugin";

import { describe, expect, test } from "vitest";

import type { SessionMetadata } from "#common/session";

import { ProfileIntegration } from "#features/profiles/integration";
import { ForgeOptions, type UseForgeOptions } from "#plugin/options";
import { createPluginStore } from "#plugin/store";
import { createEmptyPluginStore } from "#tests/plugin/fakes";

type TuiSessionUpdatedEvent = {
  properties: {
    sessionID?: string;
    info: {
      id: string;
      agent?: string;
      model?: {
        id: string;
        providerID: string;
        variant?: string | null;
      };
      metadata?: SessionMetadata;
    };
  };
};
type SessionUpdateInput = { sessionID: string; metadata: SessionMetadata };

describe("profile integration", () => {
  test("keeps the profile command and contributes both prompt slots", async () => {
    const options = { value: ForgeOptions.parse({}) };
    // SAFETY: this focused fake provides only the provider and parsed options used during setup.
    const integration = await ProfileIntegration({
      forge: { provider: async () => undefined } as never,
      options: options as never,
      store: createEmptyPluginStore(),
    });
    // SAFETY: this focused TUI fake provides only the event and session state used during setup.
    const contribution = await integration.tui!({
      event: { on: () => () => {} },
      state: { session: { get: () => undefined } },
    } as never);

    expect(contribution.commands?.map(({ name }) => name)).toEqual(["forge:profile"]);
    expect(contribution.slots?.session_prompt_right).toBeTypeOf("function");
    expect(contribution.slots?.home_prompt_right).toBeTypeOf("function");
  });

  test("keeps the profile command but omits the slot when disabled", async () => {
    const options = {
      value: ForgeOptions.parse({ tui: { components: { profile: false } } }),
    };
    // SAFETY: this focused fake provides only the provider and parsed options used during setup.
    const integration = await ProfileIntegration({
      forge: { provider: async () => undefined } as never,
      options: options as never,
      store: createEmptyPluginStore(),
    });
    // SAFETY: this focused TUI fake provides only the event used during setup.
    const contribution = await integration.tui!({ event: { on: () => () => {} } } as never);

    expect(contribution.commands?.map(({ name }) => name)).toEqual(["forge:profile"]);
    expect(contribution.slots).toEqual({});
  });

  test("uses FORGE_PROFILE for TUI session updates when it differs from options.profile", async () => {
    const options = {
      value: ForgeOptions.parse({
        profile: "configured",
        profiles: {
          configured: { models: { reviewer: { id: "configured-model" } } },
          environment: { models: { reviewer: { id: "environment-model" } } },
        },
      }),
    };
    const store = createPluginStore(
      { models: async () => ({}), usage: async () => undefined },
      { FORGE_PROFILE: "environment" },
    );
    const updates: SessionUpdateInput[] = [];
    let sessionUpdated: ((event: TuiSessionUpdatedEvent) => void) | undefined;
    const integration = await ProfileIntegration({
      // SAFETY: this focused Forge fake provides the only method used during TUI setup.
      forge: { provider: async () => undefined } as never,
      // SAFETY: this focused options fake provides the parsed profile settings used by the integration.
      options: options as never,
      store,
    });

    // SAFETY: this focused TUI fake captures only the session update listener.
    await integration.tui!({
      event: {
        on: (name: string, callback: (event: TuiSessionUpdatedEvent) => void) => {
          if (name === "session.updated") sessionUpdated = callback;
          return () => {};
        },
      },
      client: {
        session: {
          update: async (input: SessionUpdateInput) => {
            updates.push(input);
          },
        },
      },
    } as never);

    expect(sessionUpdated).toBeTypeOf("function");
    // The listener is registered during TUI setup and is invoked with a changed Forge model.
    sessionUpdated!({
      properties: {
        info: {
          id: "session",
          agent: "reviewer",
          model: { id: "alternate-model", providerID: "forge" },
        },
      },
    });
    await Promise.resolve();

    expect(updates).toEqual([
      {
        sessionID: "session",
        metadata: {
          forge: {
            profile: {
              id: "environment",
              models: { reviewer: { id: "alternate-model" } },
            },
          },
        },
      },
    ]);
  });

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
              reviewer: { id: "reviewer", provider: "anthropic", variant: "high" },
              explorer: { id: "explorer", variant: null },
            },
          },
        },
      }),
    } as UseForgeOptions;
    const integration = await ProfileIntegration({
      forge,
      options,
      store: createPluginStore(forge),
    });
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
      model: "anthropic/reviewer",
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

  test("creates missing agent entries without replacing existing agents", async () => {
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
              compaction: { id: "compaction", variant: "high" },
            },
          },
        },
      }),
    } as UseForgeOptions;
    const integration = await ProfileIntegration({
      forge,
      options,
      store: createPluginStore(forge),
    });
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
      agent: {
        reviewer: {
          description: "User reviewer",
          prompt: "Review",
        },
      },
    };

    await hooks.config!(config);

    expect(config.agent?.compaction).toMatchObject({
      model: "forge/compaction",
      variant: "high",
    });
    expect(config.agent?.reviewer).toEqual({
      description: "User reviewer",
      prompt: "Review",
    });
  });
});

import type Forge from "@forge/core";

import { describe, expect, test, vi } from "vitest";

import type { Config } from "#platform/config";

import { ModelsIntegration } from "#features/models/integration";
import { ForgeDefaultOptions, ForgeOptions } from "#plugin/options";
import { createPluginStore } from "#plugin/store";

function provider() {
  return {
    id: "forge",
    name: "Forge",
    package: "provider",
    api: { endpoint: "https://broker.test", key: "key", headers: { "X-Title": "Forge" } },
  };
}

async function configHook(forge: Forge, value = ForgeDefaultOptions) {
  // SAFETY: the focused options fake provides the value read by ModelsIntegration.
  const integration = await ModelsIntegration({
    forge,
    options: { value } as never,
    store: createPluginStore(forge),
  });
  // SAFETY: the models server adapter does not inspect its PluginInput argument.
  return (await integration.server!({} as never)).config!;
}

describe("models integration", () => {
  test("installs the provider and enables it without duplication", async () => {
    const forge = {
      provider: vi.fn(async () => provider()),
      models: vi.fn(async () => ({})),
      agents: vi.fn(async () => ({})),
    };
    // SAFETY: this fake implements the Forge methods used by models integration.
    const hook = await configHook(forge as never);
    const config: Config = {
      provider: { anthropic: { name: "Anthropic", models: {} } },
      enabled_providers: ["anthropic"],
    };

    await hook(config);
    await hook(config);

    expect(config.provider?.forge).toMatchObject({
      name: "Forge",
      npm: "provider",
      models: {},
      options: { baseURL: "https://broker.test", apiKey: "key" },
    });
    expect(config.enabled_providers).toEqual(["anthropic", "forge"]);
  });

  test("merges allowlisted agents with user configuration taking priority", async () => {
    const agents: Awaited<ReturnType<Forge["agents"]>> = {
      reviewer: { description: "Forge reviewer", prompt: "Review", model: "forge/default" },
      hidden: { description: "Hidden", prompt: "Hidden" },
    };
    const forge = {
      provider: vi.fn(async () => provider()),
      models: vi.fn(async () => ({})),
      agents: vi.fn(async () => agents),
    };
    const value = ForgeOptions.parse({ agents: ["reviewer"] });
    // SAFETY: this fake implements the Forge methods used by models integration.
    const hook = await configHook(forge as never, value);
    const config: Config = {
      agent: { reviewer: { description: "User reviewer", temperature: 0.1 } },
    };

    await hook(config);

    expect(config.agent).toEqual({
      reviewer: {
        description: "User reviewer",
        prompt: "Review",
        model: "forge/default",
        temperature: 0.1,
      },
    });
  });

  test("can disable Forge agents", async () => {
    const forge = {
      provider: vi.fn(async () => provider()),
      models: vi.fn(async () => ({})),
      agents: vi.fn(async () => ({})),
    };
    // SAFETY: this fake implements the Forge methods used by models integration.
    const hook = await configHook(forge as never, ForgeOptions.parse({ agents: false }));
    const config: Config = { agent: { custom: { description: "User" } } };

    await hook(config);

    expect(forge.agents).not.toHaveBeenCalled();
    expect(config.agent).toEqual({ custom: { description: "User" } });
  });
});

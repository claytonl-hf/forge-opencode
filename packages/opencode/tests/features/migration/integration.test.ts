import { describe, expect, test, vi } from "vitest";

import type { Config } from "#platform/config";

import { migrationHooks } from "#features/migration/integration";

describe("migration integration", () => {
  test("removes legacy configuration before other features configure it", async () => {
    const hooks = migrationHooks();
    const config: Config = {
      provider: { openrouter: { name: "Forge OpenRouter", models: {} } },
      mcp: { forge: { type: "remote", url: "https://forge.test" } },
      permission: { forge_write: "allow", edit: "ask" },
    };

    await hooks.config!(config);

    expect(config.provider).toEqual({});
    expect(config.mcp).toEqual({});
    expect(config.permission).toEqual({ edit: "ask" });
  });

  test("runs the persistent migration when the server connects", async () => {
    const run = vi.fn(async () => {});
    const hooks = migrationHooks(run);

    // SAFETY: the migration event hook only inspects event.type.
    await hooks.event!({ event: { type: "server.connected" } } as never);

    expect(run).toHaveBeenCalledTimes(1);
  });
});

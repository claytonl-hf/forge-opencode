import type { TuiPluginApi } from "@opencode-ai/plugin/tui";

import { describe, expect, test } from "vitest";

import { UsageIntegration } from "#features/usage/integration";
import { ForgeOptions } from "#plugin/options";
import { createPluginStore } from "#plugin/store";

import { stub } from "./usage-fixtures";

type PromptResult = { ok: boolean };
type Prompt = (...args: object[]) => Promise<PromptResult>;

describe("usage integration", () => {
  test("owns its home status and Forge sidebar line", async () => {
    const options = { value: ForgeOptions.parse({}) };
    const models = stub(async () => ({}));
    const forge = { usage: async () => undefined, models: () => models.fn() };
    const tui = createTuiApi();
    // SAFETY: UsageIntegration only uses these focused Forge methods during setup.
    const integration = await UsageIntegration({
      forge: forge as never,
      options: options as never,
      store: createPluginStore(forge),
    });
    const contribution = await integration.tui!(tui.api);

    expect(models.calls).toHaveLength(1);
    expect(contribution.slots?.home_bottom).toBeTypeOf("function");
    expect(contribution.slots?.sidebar_content).toHaveLength(1);
  });

  test("does not throw and contributes no slots when usage is disabled", async () => {
    const options = {
      value: ForgeOptions.parse({ tui: { components: { usage: false } } }),
    };
    const forge = { usage: async () => undefined, models: async () => ({}) };
    const tui = createTuiApi();
    const originalPrompt = tui.api.client.session.prompt;
    // SAFETY: UsageIntegration only uses these focused Forge methods during setup.
    const integration = await UsageIntegration({
      forge: forge as never,
      options: options as never,
      store: createPluginStore(forge),
    });
    const contribution = await integration.tui!(tui.api);

    expect(contribution.slots).toEqual({});
    expect(tui.api.client.session.prompt).not.toBe(originalPrompt);
    expect(tui.disposers).toHaveLength(1);
    for (const dispose of tui.disposers) dispose();
    expect(tui.api.client.session.prompt).toBe(originalPrompt);
  });
});

function createTuiApi() {
  const disposers: (() => void)[] = [];
  const prompt: Prompt = async () => ({ ok: true });
  // SAFETY: This focused TUI fake implements the client, lifecycle, and dialog members used here.
  const api = Object.assign({} as TuiPluginApi, {
    client: {
      session: { prompt },
      v2: { session: { prompt } },
    },
    lifecycle: {
      onDispose(dispose: () => void) {
        disposers.push(dispose);
      },
    },
    ui: {
      dialog: {
        clear() {
          // Integration tests only exercise TUI setup and disposal.
        },
      },
    },
  });
  return { api, disposers };
}

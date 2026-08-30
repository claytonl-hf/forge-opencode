import type { ForgeModels } from "@forge/core";

import { describe, expect, test, vi } from "vitest";

import { createPluginStore } from "#plugin/store";

const forge = { models: async () => ({}), usage: async () => undefined };
const model = {
  id: "model-a",
  name: "Model A",
  description: "",
  attachment: false,
  reasoning: false,
  tool_call: true,
  release_date: "",
  last_updated: "",
  modalities: { input: ["text"], output: ["text"] },
  open_weights: false,
  limit: { context: 128_000, output: 16_384 },
  cost: { input: 0, output: 0 },
  metadata: { cost: { tier: "low", band: "$" }, speed: { rate: 1, tier: "fast" } },
} satisfies ForgeModels[string];

class FakeForge {
  receiver = "";

  async models() {
    this.receiver = await this.state();
    return {};
  }

  async state() {
    return "ok";
  }

  async usage() {
    this.receiver = await this.state();
    return undefined;
  }
}

describe("plugin store", () => {
  test("deduplicates overlapping model refreshes", async () => {
    let resolve: (value: ForgeModels) => void = () => undefined;
    const models = vi.fn(() => new Promise<ForgeModels>((done) => (resolve = done)));
    const store = createPluginStore({ models, usage: async () => undefined });

    const first = store.models.refresh();
    const second = store.models.refresh();
    resolve({});

    await expect(Promise.all([first, second])).resolves.toEqual([{}, {}]);
    expect(models).toHaveBeenCalledTimes(1);
  });

  test("preserves the Forge receiver when refreshing models and usage", async () => {
    const forge = new FakeForge();
    const store = createPluginStore({
      models: () => forge.models(),
      usage: () => forge.usage(),
    });

    await store.models.refresh();
    await store.usage.refresh();
    expect(forge.receiver).toBe("ok");
  });

  test("prevents session profile state leaking between store instances", () => {
    const first = createPluginStore(forge);
    const second = createPluginStore(forge);

    first.session.profile.set({ id: "balanced", models: { reviewer: { id: "reviewer" } } });

    expect(second.session.profile.get()).toBeUndefined();
    expect(first.session.profile.get()).toEqual({
      id: "balanced",
      models: { reviewer: { id: "reviewer" } },
    });
  });

  test("stores the supported environment overrides", () => {
    const store = createPluginStore(forge, {
      FORGE_USAGE_ALERT_BALANCE: "3.5",
    });

    expect(store.env).toEqual({
      FORGE_USAGE_ALERT_BALANCE: "3.5",
    });
  });

  test("notifies listeners on set and clear, then stops after unsubscribe", () => {
    const store = createPluginStore(forge);
    const listener = vi.fn();
    const unsubscribe = store.session.profile.listen(listener);

    store.session.profile.set({
      id: "balanced",
      models: { reviewer: { id: "reviewer", variant: "fast" } },
    });
    store.session.profile.set(undefined);
    unsubscribe();
    store.session.profile.set({ id: "ignored" });

    expect(listener.mock.calls.map(([value]) => value)).toEqual([
      { id: "balanced", models: { reviewer: { id: "reviewer", variant: "fast" } } },
      undefined,
    ]);
  });

  test("resolves forge-prefixed model ids and returns undefined for missing ids", async () => {
    const store = createPluginStore({
      models: async () => ({ "model-a": model }),
      usage: async () => undefined,
    });
    await store.models.refresh();

    expect(store.models.getModel("forge/model-a")).toEqual({
      name: "Model A",
      metadata: model.metadata,
    });
    expect(store.models.getModel("missing")).toBeUndefined();
  });
});

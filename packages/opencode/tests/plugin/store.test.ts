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

    first.session.set("balanced");

    expect(second.session.get()).toBeUndefined();
    expect(first.session.get()).toBe("balanced");
  });

  test("get returns the value without clearing it", () => {
    const store = createPluginStore(forge);
    store.session.set("balanced");

    expect(store.session.get()).toBe("balanced");
    expect(store.session.get()).toBe("balanced");
    store.session.set(null);
    expect(store.session.get()).toBeNull();
  });

  test("notifies listeners on set and clear, then stops after unsubscribe", () => {
    const store = createPluginStore(forge);
    const listener = vi.fn();
    const unsubscribe = store.session.listen(listener);

    store.session.set("balanced");
    store.session.set(undefined);
    unsubscribe();
    store.session.set("ignored");

    expect(listener.mock.calls.map(([value]) => value)).toEqual(["balanced", undefined]);
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

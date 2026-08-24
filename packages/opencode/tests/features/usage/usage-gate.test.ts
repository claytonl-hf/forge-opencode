import type { ForgeModelCostTier, ForgeUsage } from "@forge/core";

import { describe, expect, test } from "vitest";

import {
  blockMessage,
  dialogMessage,
  dialogTitle,
  getLowTierModels,
  isLowTierModel,
  parseThreshold,
  shouldBlock,
  DEFAULT_THRESHOLD_USD,
} from "#features/usage/gate";
import { createUsageSessionHooks } from "#features/usage/session";
import { createPluginStore } from "#plugin/store";

import { catalog, stub, usage } from "./usage-fixtures";

function forgeWithUsage(snapshot: ForgeUsage | null | undefined, models = catalog({})) {
  const usageCall = stub(async () => snapshot);
  // SAFETY: This focused Forge fake implements the only method used by the usage hooks.
  return {
    store: createPluginStore({ models: async () => models, usage: () => usageCall.fn() }),
    calls: usageCall.calls,
  };
}

describe("usage gate", () => {
  test.each([
    [undefined, DEFAULT_THRESHOLD_USD],
    ["", DEFAULT_THRESHOLD_USD],
    ["not-a-number", DEFAULT_THRESHOLD_USD],
    ["0", DEFAULT_THRESHOLD_USD],
    ["-1", DEFAULT_THRESHOLD_USD],
    ["3.5", 3.5],
  ])("parses threshold %s", (value, threshold) => {
    expect(parseThreshold(value)).toBe(threshold);
  });

  test.each<[ForgeModelCostTier | undefined, boolean | undefined]>([
    ["mid", false],
    ["high", false],
    ["low", true],
    [undefined, undefined],
  ])("isLowTierModel(%s) is %s", (tier, lowTier) => {
    const model = tier ? { metadata: { cost: { tier } } } : undefined;
    // SAFETY: isLowTierModel only calls getModel; this stub returns the table-driven metadata.
    const models = { getModel: () => model } as never;
    expect(isLowTierModel(models, "model-id")).toBe(lowTier);
  });

  test.each([
    ["above the threshold", 2.01, false],
    ["at the threshold", 2, true],
    ["below the threshold", 1.99, true],
  ])("%s", (_, remainingUsd, blocked) => {
    expect(shouldBlock(usage(remainingUsd))).toBe(blocked);
  });

  test("blocks exhausted usage even when balance is above the threshold", () => {
    expect(shouldBlock(usage(10, true))).toBe(true);
  });

  test.each([undefined, null])("allows missing usage snapshot (%s)", (snapshot) => {
    expect(shouldBlock(snapshot)).toBe(false);
  });

  test("formats the blocking message with balance, threshold, floor model, and reset time", () => {
    const snapshot = usage(2);

    expect(blockMessage(snapshot)).toBe(
      "Forge daily balance is $2.00, at or below the $2.00 threshold. Forge would silently route this request to a floor model. Reset at 2026-08-22T00:00:00Z.",
    );
  });

  test("lists low-tier catalog models sorted by display name", () => {
    const models = catalog({ "z-model": "low", "a-model": "low", "mid-model": "mid" });
    const zModel = models["z-model"];
    const aModel = models["a-model"];
    const midModel = models["mid-model"];
    if (!zModel || !aModel || !midModel) throw new Error("test catalog is incomplete");
    zModel.name = "Zulu";
    aModel.name = "Alpha";
    midModel.name = "Middle";

    expect(getLowTierModels(models)).toEqual([
      { id: "a-model", name: "Alpha" },
      { id: "z-model", name: "Zulu" },
    ]);
  });

  test("formats the blocking dialog with allowed low-tier names", () => {
    expect(dialogTitle).toBe("You are almost out of Forge credits");
    expect(dialogMessage("Pareto", ["Lite", "Nano"])).toBe(
      "The requested model, Pareto, can no longer be used. Switch to any of the following models: Lite, Nano.",
    );
  });

  test("omits the allowed-model sentence when no low-tier model exists", () => {
    expect(dialogMessage("Pareto", [])).toBe("The requested model, Pareto, can no longer be used.");
  });

  test.each(["mid-model", "high-model"])(
    "%s throws when the balance gate blocks",
    async (modelID) => {
      const { store } = forgeWithUsage(
        usage(DEFAULT_THRESHOLD_USD),
        catalog({ "mid-model": "mid", "high-model": "high" }),
      );
      await store.models.refresh();
      const hooks = createUsageSessionHooks(store);

      // SAFETY: The test supplies only the hook fields used by the real handler.
      await expect(
        hooks["chat.message"]?.(
          { model: { providerID: "forge", modelID: "low-model" } } as never,
          { message: { model: { providerID: "forge", modelID } } } as never,
        ),
      ).rejects.toThrow(
        "Forge daily balance is $2.00, at or below the $2.00 threshold. Forge would silently route this request to a floor model. Reset at 2026-08-22T00:00:00Z.",
      );
    },
  );

  test("chat.params uses the input model id", async () => {
    const { store } = forgeWithUsage(
      usage(DEFAULT_THRESHOLD_USD),
      catalog({ "high-model": "high" }),
    );
    await store.models.refresh();
    const hooks = createUsageSessionHooks(store);

    // SAFETY: The test supplies only the hook fields used by the real handler.
    await expect(
      hooks["chat.params"]?.(
        { model: { providerID: "forge", id: "forge/high-model" } } as never,
        {} as never,
      ),
    ).rejects.toThrow(
      "Forge daily balance is $2.00, at or below the $2.00 threshold. Forge would silently route this request to a floor model. Reset at 2026-08-22T00:00:00Z.",
    );
  });

  test("chat.message prefers output.message.model over input.model", async () => {
    const { store } = forgeWithUsage(
      usage(DEFAULT_THRESHOLD_USD),
      catalog({ "input-model": "low", "output-model": "mid" }),
    );
    await store.models.refresh();
    const hooks = createUsageSessionHooks(store);

    // SAFETY: The test supplies only the hook fields used by the real handler.
    await expect(
      hooks["chat.message"]?.(
        { model: { providerID: "forge", modelID: "input-model" } } as never,
        { message: { model: { providerID: "forge", modelID: "output-model" } } } as never,
      ),
    ).rejects.toThrow(
      "Forge daily balance is $2.00, at or below the $2.00 threshold. Forge would silently route this request to a floor model. Reset at 2026-08-22T00:00:00Z.",
    );
  });

  test("does not throw for a blocked low-tier target", async () => {
    const { store } = forgeWithUsage(usage(DEFAULT_THRESHOLD_USD), catalog({ "low-model": "low" }));
    await store.models.refresh();
    const hooks = createUsageSessionHooks(store);

    // SAFETY: The test supplies only the hook fields used by the real handler.
    await expect(
      hooks["chat.message"]?.(
        { model: { providerID: "forge", modelID: "low-model" } } as never,
        { message: { model: { providerID: "forge", modelID: "low-model" } } } as never,
      ),
    ).resolves.toBeUndefined();
  });

  test.each([
    ["unknown catalog model", { providerID: "forge", modelID: "missing-model" }],
    ["missing catalog model", undefined],
    ["non-Forge provider", { providerID: "openai", modelID: "high-model" }],
  ])("does not throw for %s", async (_, model) => {
    const { store } = forgeWithUsage(
      usage(DEFAULT_THRESHOLD_USD),
      catalog({ "high-model": "high" }),
    );
    await store.models.refresh();
    const hooks = createUsageSessionHooks(store);

    // SAFETY: The test supplies only the hook fields used by the real handler.
    await expect(
      hooks["chat.message"]?.({ model: model as never } as never, { message: {} } as never),
    ).resolves.toBeUndefined();
  });

  test.each([
    ["allowed", usage(2.01)],
    ["missing", undefined],
    ["null", null],
  ])("does not throw when usage is %s", async (_, snapshot) => {
    const { store } = forgeWithUsage(snapshot, catalog({ "high-model": "high" }));
    await store.models.refresh();
    const hooks = createUsageSessionHooks(store);

    // SAFETY: The test supplies only the hook fields used by the real handler.
    await expect(
      hooks["chat.message"]?.(
        { model: { providerID: "forge", modelID: "high-model" } } as never,
        { message: {} } as never,
      ),
    ).resolves.toBeUndefined();
    // SAFETY: The test supplies only the hook fields used by the real handler.
    await expect(
      hooks["chat.params"]?.(
        { model: { providerID: "forge", id: "high-model" } } as never,
        {} as never,
      ),
    ).resolves.toBeUndefined();
  });

  test("coalesces in-flight usage reads", async () => {
    let resolve: (value: ForgeUsage) => void = () => {};
    const usageCall = stub(
      () =>
        new Promise<ForgeUsage>((fulfill) => {
          resolve = fulfill;
        }),
    );
    // SAFETY: This focused Forge fake implements the only method used by the usage hooks.
    const store = createPluginStore({
      models: async () => catalog({ "high-model": "high" }),
      usage: () => usageCall.fn(),
    });
    await store.models.refresh();
    const hooks = createUsageSessionHooks(store);

    // SAFETY: The test supplies only the hook fields used by the real handler.
    const message = hooks["chat.message"]?.(
      { model: { providerID: "forge", modelID: "high-model" } } as never,
      { message: {} } as never,
    );
    // SAFETY: The test supplies only the hook fields used by the real handler.
    const params = hooks["chat.params"]?.(
      { model: { providerID: "forge", id: "high-model" } } as never,
      {} as never,
    );
    expect(usageCall.calls).toHaveLength(1);
    resolve(usage(10));

    await expect(message).resolves.toBeUndefined();
    await expect(params).resolves.toBeUndefined();
  });
});

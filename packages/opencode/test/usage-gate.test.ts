import type Forge from "@forge/core";

import { describe, expect, test } from "bun:test";

import {
  blockMessage,
  dialogMessage,
  dialogTitle,
  isAboveLow,
  lowTierModels,
  shouldBlock,
  THRESHOLD_USD,
  type CostTier,
  type ForgeUsage,
} from "../src/features/usage/gate";
import { createUsageSessionHooks } from "../src/features/usage/session";
import { catalog, stub, usage } from "./usage-fixtures";

function forgeWithUsage(snapshot: ForgeUsage | null | undefined) {
  const usageCall = stub(async () => snapshot);
  // SAFETY: This focused Forge fake implements the only method used by the usage hooks.
  return {
    forge: { usage: usageCall.fn } as Pick<Forge, "usage">,
    calls: usageCall.calls,
  };
}

describe("usage gate", () => {
  test.each<[CostTier | undefined, boolean]>([
    ["mid", true],
    ["high", true],
    ["low", false],
    [undefined, false],
  ])("isAboveLow(%s) is %s", (tier, aboveLow) => {
    expect(isAboveLow(tier)).toBe(aboveLow);
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

    expect(lowTierModels(models)).toEqual([
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
      const { forge } = forgeWithUsage(usage(THRESHOLD_USD));
      const hooks = createUsageSessionHooks(
        forge,
        catalog({ "mid-model": "mid", "high-model": "high" }),
      );

      // SAFETY: The test supplies only the hook fields used by the real handler.
      await expect(
        hooks["chat.message"]?.(
          { model: { providerID: "forge", modelID: "low-model" } } as never,
          { message: { model: { providerID: "forge", modelID } } } as never,
        ),
      ).rejects.toThrow(blockMessage(usage(THRESHOLD_USD)));
    },
  );

  test("chat.params uses the input model id", async () => {
    const { forge } = forgeWithUsage(usage(THRESHOLD_USD));
    const hooks = createUsageSessionHooks(forge, catalog({ "high-model": "high" }));

    // SAFETY: The test supplies only the hook fields used by the real handler.
    await expect(
      hooks["chat.params"]?.(
        { model: { providerID: "forge", id: "forge/high-model" } } as never,
        {} as never,
      ),
    ).rejects.toThrow(blockMessage(usage(THRESHOLD_USD)));
  });

  test("chat.message prefers output.message.model over input.model", async () => {
    const { forge } = forgeWithUsage(usage(THRESHOLD_USD));
    const hooks = createUsageSessionHooks(
      forge,
      catalog({ "input-model": "low", "output-model": "mid" }),
    );

    // SAFETY: The test supplies only the hook fields used by the real handler.
    await expect(
      hooks["chat.message"]?.(
        { model: { providerID: "forge", modelID: "input-model" } } as never,
        { message: { model: { providerID: "forge", modelID: "output-model" } } } as never,
      ),
    ).rejects.toThrow(blockMessage(usage(THRESHOLD_USD)));
  });

  test("does not throw for a blocked low-tier target", async () => {
    const { forge } = forgeWithUsage(usage(THRESHOLD_USD));
    const hooks = createUsageSessionHooks(forge, catalog({ "low-model": "low" }));

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
    const { forge } = forgeWithUsage(usage(THRESHOLD_USD));
    const hooks = createUsageSessionHooks(forge, catalog({ "high-model": "high" }));

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
    const { forge } = forgeWithUsage(snapshot);
    const hooks = createUsageSessionHooks(forge, catalog({ "high-model": "high" }));

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
    const forge = { usage: usageCall.fn } as Pick<Forge, "usage">;
    const hooks = createUsageSessionHooks(forge, catalog({ "high-model": "high" }));

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
    expect("models" in forge).toBe(false);
  });
});

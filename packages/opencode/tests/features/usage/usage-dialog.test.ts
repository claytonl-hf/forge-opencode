import type { ForgeUsage } from "@forge/core";
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { startUsageGateDialog } from "#features/usage/dialog";
import { dialogTitle, THRESHOLD_USD } from "#features/usage/gate";
import { createPluginStore } from "#plugin/store";

import { catalog, stub, usage } from "./usage-fixtures";

type Toast = {
  variant: "error";
  title: string;
  message: string;
  duration: number;
};

type Dialog = {
  title: string;
  message: string;
};

type PromptResult = { value: string };
type Prompt = (input: { sessionID: string }) => Promise<PromptResult>;
type SessionModel = { id: string; providerID: string };

function createStore(
  snapshots: ForgeUsage | null | undefined | (ForgeUsage | null | undefined)[],
  models = catalog({}),
) {
  const values = Array.isArray(snapshots) ? snapshots : [snapshots];
  let index = 0;
  const usageCall = stub(async () => values[Math.min(index++, values.length - 1)]);
  // SAFETY: This focused Forge fake implements the only method used by the usage gate handler.
  return createPluginStore({ models: async () => models, usage: () => usageCall.fn() });
}

function createThrowingStore() {
  const usageCall = stub(async () => {
    throw new Error("usage unavailable");
  });
  // SAFETY: This focused Forge fake only exercises the usage failure path.
  return createPluginStore({ models: async () => catalog({}), usage: () => usageCall.fn() });
}

function createTui(
  options: {
    sessionPrompt?: Prompt;
    v2SessionPrompt?: Prompt;
    sessionModel?: SessionModel | null;
    clientSessionModel?: SessionModel | null;
    clientSessionModels?: Record<string, SessionModel | null>;
    children?: Record<string, string[]>;
  } = {},
) {
  const disposers: (() => void)[] = [];
  const toasts: Toast[] = [];
  const interrupted: string[] = [];
  const sessionPrompt = stub(options.sessionPrompt ?? (async () => ({ value: "session-result" })));
  const v2SessionPrompt = stub(
    options.v2SessionPrompt ?? (async () => ({ value: "v2-session-result" })),
  );
  const toast = stub((payload: Toast) => {
    toasts.push(payload);
  });
  const dialogAlert = stub((props: Dialog) => props);
  const dialogReplace = stub((render: () => Dialog) => {
    render();
  });
  const dialogClear = stub(() => {});
  const stateModel =
    options.sessionModel === undefined
      ? { id: "high-model", providerID: "forge" }
      : (options.sessionModel ?? undefined);
  const stateGet = stub((sessionID: string) => {
    if (sessionID !== "session") return undefined;
    return stateModel ? { model: stateModel } : undefined;
  });
  const sessionGet = stub(async ({ sessionID }: { sessionID: string }) => {
    const model =
      options.clientSessionModels && sessionID in options.clientSessionModels
        ? options.clientSessionModels[sessionID]
        : sessionID === "session"
          ? options.clientSessionModel
          : undefined;
    return { data: model ? { model } : undefined };
  });
  const children = stub(async ({ sessionID }: { sessionID: string }) => ({
    data: (options.children?.[sessionID] ?? []).map((id) => ({ id })),
  }));
  const interrupt = stub(async ({ sessionID }: { sessionID: string }) => {
    interrupted.push(sessionID);
  });
  const client = {
    session: {
      prompt: (args: { sessionID: string }) => sessionPrompt.fn(args),
      get: (args: { sessionID: string }) => sessionGet.fn(args),
      children: (args: { sessionID: string }) => children.fn(args),
      interrupt: (args: { sessionID: string }) => interrupt.fn(args),
    },
    v2: {
      session: {
        prompt: (args: { sessionID: string }) => v2SessionPrompt.fn(args),
      },
    },
  };
  // SAFETY: This focused TUI fake implements the client, state, lifecycle, and UI members used here.
  const api = Object.assign({} as TuiPluginApi, {
    client,
    state: {
      session: {
        get: (sessionID: string) => stateGet.fn(sessionID),
      },
    },
    lifecycle: {
      onDispose(dispose: () => void) {
        disposers.push(dispose);
      },
    },
    ui: {
      toast: (payload: Toast) => toast.fn(payload),
      DialogAlert: (props: Dialog) => dialogAlert.fn(props),
      dialog: {
        replace: (render: () => Dialog) => dialogReplace.fn(render),
        clear: () => dialogClear.fn(),
      },
    },
  });

  return {
    api,
    client,
    toasts,
    interrupted,
    dialogAlert: dialogAlert.calls,
    dialogReplace: dialogReplace.calls,
    dialogClear: dialogClear.calls,
    sessionPrompt: sessionPrompt.calls,
    v2SessionPrompt: v2SessionPrompt.calls,
    sessionGet: sessionGet.calls,
    stateGet: stateGet.calls,
    children: children.calls,
    interrupt: interrupt.calls,
    dispose() {
      for (const dispose of disposers) dispose();
    },
  };
}

async function settle() {
  for (const _ of Array.from({ length: 12 })) await Promise.resolve();
}

function sessionPrompt(tui: ReturnType<typeof createTui>): Promise<PromptResult> {
  // SAFETY: The fake client accepts this focused session prompt input.
  return tui.client.session.prompt({ sessionID: "session" });
}

function v2SessionPrompt(tui: ReturnType<typeof createTui>): Promise<PromptResult> {
  // SAFETY: The fake client accepts this focused v2 session prompt input.
  return tui.client.v2.session.prompt({ sessionID: "session" });
}

function expectNoDialogs(tui: ReturnType<typeof createTui>) {
  expect(tui.dialogReplace).toHaveLength(0);
  expect(tui.dialogAlert).toHaveLength(0);
}

describe("usage gate dialogs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("shows a DialogAlert for a blocked Forge mid-tier rejected prompt", async () => {
    const rejection = new Error("send failed");
    const tui = createTui({
      sessionModel: { id: "pareto", providerID: "forge" },
      sessionPrompt: () => Promise.reject(rejection),
    });
    const store = createStore(
      usage(THRESHOLD_USD),
      catalog(
        { pareto: "mid", lite: "low", nano: "low" },
        { pareto: "Pareto", lite: "Lite", nano: "Nano" },
      ),
    );
    await store.models.refresh();
    startUsageGateDialog(tui.api, store);

    await expect(sessionPrompt(tui)).rejects.toBe(rejection);
    await settle();

    expect(tui.toasts).toHaveLength(0);
    expect(tui.dialogReplace).toHaveLength(0);
    vi.advanceTimersByTime(0);

    expect(tui.dialogAlert[0]?.[0]).toEqual({
      title: dialogTitle,
      message:
        "The requested model, Pareto, can no longer be used. Switch to any of the following models: Lite, Nano.",
    });
    expect(tui.dialogReplace).toHaveLength(1);
    expect(tui.interrupted).toEqual(["session"]);
    tui.dispose();
  });

  test("uses the fresh HTTP model and never dialogs for a fulfilled low-tier prompt", async () => {
    const tui = createTui({
      sessionModel: { id: "pareto", providerID: "forge" },
      clientSessionModel: { id: "lite", providerID: "forge" },
    });
    const store = createStore(
      usage(THRESHOLD_USD),
      catalog({ pareto: "mid", lite: "low" }, { pareto: "Pareto", lite: "Lite" }),
    );
    await store.models.refresh();
    startUsageGateDialog(tui.api, store);

    await sessionPrompt(tui);
    await settle();
    vi.advanceTimersByTime(0);

    expectNoDialogs(tui);
    expect(tui.toasts).toHaveLength(0);
    expect(tui.sessionGet).toHaveLength(1);
    expect(tui.stateGet).toHaveLength(0);
    expect(tui.interrupted).toHaveLength(0);
    tui.dispose();
  });

  test("does not dialog or interrupt a blocked non-Forge prompt", async () => {
    const tui = createTui({ sessionModel: { id: "gpt", providerID: "openai" } });
    const store = createStore(usage(THRESHOLD_USD), catalog({ "high-model": "high" }));
    await store.models.refresh();
    startUsageGateDialog(tui.api, store);

    await sessionPrompt(tui);
    await settle();
    vi.advanceTimersByTime(0);

    expectNoDialogs(tui);
    expect(tui.toasts).toHaveLength(0);
    expect(tui.interrupted).toHaveLength(0);
    tui.dispose();
  });

  test("interrupts a blocked Forge high-tier child without interrupting a low-tier parent", async () => {
    const tui = createTui({
      sessionModel: { id: "lite", providerID: "forge" },
      clientSessionModels: {
        child: { id: "pareto", providerID: "forge" },
      },
      children: { session: ["child"], child: [] },
    });
    const store = createStore(
      usage(THRESHOLD_USD),
      catalog({ lite: "low", pareto: "high" }, { lite: "Lite", pareto: "Pareto" }),
    );
    await store.models.refresh();
    startUsageGateDialog(tui.api, store);

    await sessionPrompt(tui);
    await settle();
    vi.advanceTimersByTime(0);

    expectNoDialogs(tui);
    expect(tui.interrupted).toEqual(["child"]);
    expect(tui.interrupt).toHaveLength(1);
    tui.dispose();
  });

  test("wraps v2 prompts and preserves the original fulfilled result", async () => {
    const returned = Promise.resolve({ value: "sentinel" });
    const tui = createTui({ v2SessionPrompt: () => returned });
    const store = createStore(usage(THRESHOLD_USD), catalog({ "high-model": "high" }));
    await store.models.refresh();
    startUsageGateDialog(tui.api, store);

    const result = v2SessionPrompt(tui);
    expect(result).toBe(returned);
    await result;
    await settle();
    vi.advanceTimersByTime(0);

    expectNoDialogs(tui);
    expect(tui.v2SessionPrompt).toHaveLength(1);
    tui.dispose();
  });

  test("fails open when usage lookup throws", async () => {
    const tui = createTui();
    const store = createThrowingStore();
    await store.models.refresh();
    startUsageGateDialog(tui.api, store);

    await sessionPrompt(tui);
    await settle();

    expectNoDialogs(tui);
    expect(tui.interrupted).toHaveLength(0);
    tui.dispose();
  });

  test("does not show a dialog above the usage threshold", async () => {
    const tui = createTui();
    const store = createStore(usage(THRESHOLD_USD + 0.01), catalog({ "high-model": "high" }));
    await store.models.refresh();
    startUsageGateDialog(tui.api, store);

    await sessionPrompt(tui);
    await settle();
    vi.advanceTimersByTime(0);

    expectNoDialogs(tui);
    expect(tui.interrupted).toHaveLength(0);
    tui.dispose();
  });

  test("restores both prompt methods and clears a pending dialog on dispose", async () => {
    const rejection = new Error("send failed");
    const tui = createTui({
      sessionPrompt: () => Promise.reject(rejection),
    });
    const originalPrompt = tui.client.session.prompt;
    const originalV2Prompt = tui.client.v2.session.prompt;
    const store = createStore(usage(THRESHOLD_USD), catalog({ "high-model": "high" }));
    await store.models.refresh();
    startUsageGateDialog(tui.api, store);

    await expect(sessionPrompt(tui)).rejects.toBe(rejection);
    await settle();
    expectNoDialogs(tui);

    tui.dispose();
    expect(tui.client.session.prompt).toBe(originalPrompt);
    expect(tui.client.v2.session.prompt).toBe(originalV2Prompt);
    expect(tui.dialogClear).toHaveLength(1);

    vi.advanceTimersByTime(0);
    expectNoDialogs(tui);
  });
});

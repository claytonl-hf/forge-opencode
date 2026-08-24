import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  emitIdleEvent,
  NotifierIntegration,
  type DoneNotifierPayload,
} from "#features/notifier/integration";
import { createEmptyPluginStore } from "#tests/plugin/fakes";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

async function temporaryBridge() {
  const directory = await mkdtemp(join(tmpdir(), "forge-notifier-"));
  temporaryDirectories.push(directory);
  return join(directory, "nested", "events.jsonl");
}

function session(id: string) {
  return {
    id,
    slug: id,
    projectID: "project",
    directory: "/worktree",
    title: "Implement notifier",
    version: "1",
    time: { created: 1, updated: 2 },
  };
}

describe("done notifier integration", () => {
  test("appends the original Forge JSONL payload and creates the bridge directory", async () => {
    const bridgeFile = await temporaryBridge();
    const finishedAt = Date.now();

    emitIdleEvent(bridgeFile, "session-1", session("session-1"));

    const payload: DoneNotifierPayload = JSON.parse(await readFile(bridgeFile, "utf8"));
    expect(payload).toMatchObject({
      v: 1,
      type: "session.idle",
      sessionId: "session-1",
      title: "Implement notifier",
      directory: "/worktree",
    });
    expect(payload.finishedAt).toBeGreaterThanOrEqual(finishedAt);
  });

  test("registers for idle events and unsubscribes when the TUI is disposed", async () => {
    const bridgeFile = await temporaryBridge();
    const unsubscribe = vi.fn(() => {});
    let idleHandler: ((event: { properties: { sessionID: string } }) => void) | undefined;
    let dispose: (() => void) | undefined;
    const api = {
      event: {
        on: vi.fn((_type: string, handler: typeof idleHandler) => {
          idleHandler = handler;
          return unsubscribe;
        }),
      },
      lifecycle: {
        onDispose: vi.fn((handler: () => void) => {
          dispose = handler;
          return () => {};
        }),
      },
      renderer: { on: vi.fn(() => {}), off: vi.fn(() => {}) },
      route: { current: { name: "home" } },
      state: { session: { get: vi.fn((id: string) => session(id)) } },
    };
    const forge = { opencode: vi.fn(async () => ({ bridge: { notifier: bridgeFile } })) };
    const options = { value: { tui: { notify: true } } };

    // SAFETY: the focused fakes provide the Forge and option values used by the notifier.
    const integration = await NotifierIntegration({
      forge: forge as never,
      options: options as never,
      store: createEmptyPluginStore(),
    });
    // SAFETY: the fake implements the event, lifecycle, and session APIs used by the notifier.
    await integration.tui!(api as never);
    idleHandler?.({ properties: { sessionID: "session-2" } });

    const payload: DoneNotifierPayload = JSON.parse(await readFile(bridgeFile, "utf8"));
    expect(payload.sessionId).toBe("session-2");
    expect(api.state.session.get).toHaveBeenCalledWith("session-2");
    dispose?.();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(api.renderer.off).toHaveBeenCalledTimes(2);
  });

  test("skips the visibly focused session and resumes after blur", async () => {
    const bridgeFile = await temporaryBridge();
    await mkdir(dirname(bridgeFile), { recursive: true });
    await writeFile(bridgeFile, "");
    let idleHandler: ((event: { properties: { sessionID: string } }) => void) | undefined;
    const rendererHandlers = new Map<string, () => void>();
    const api = {
      event: {
        on: vi.fn((_type: string, handler: typeof idleHandler) => {
          idleHandler = handler;
          return () => {};
        }),
      },
      lifecycle: { onDispose: vi.fn(() => () => {}) },
      renderer: {
        on: vi.fn((event: string, handler: () => void) => rendererHandlers.set(event, handler)),
        off: vi.fn(() => {}),
      },
      route: { current: { name: "session", params: { sessionID: "session-5" } } },
      state: { session: { get: vi.fn((id: string) => session(id)) } },
    };
    const forge = { opencode: vi.fn(async () => ({ bridge: { notifier: bridgeFile } })) };
    const options = { value: { tui: { notify: true } } };

    // SAFETY: these focused fakes implement only the Forge, options, and TUI APIs used here.
    const integration = await NotifierIntegration({
      forge: forge as never,
      options: options as never,
      store: createEmptyPluginStore(),
    });
    // SAFETY: this TUI fake implements every API member notifier setup reads.
    await integration.tui!(api as never);

    rendererHandlers.get("focus")?.();
    idleHandler?.({ properties: { sessionID: "session-5" } });
    const stats = await stat(bridgeFile);
    expect(stats.size).toBe(0);

    rendererHandlers.get("blur")?.();
    idleHandler?.({ properties: { sessionID: "session-5" } });
    expect(JSON.parse(await readFile(bridgeFile, "utf8"))).toMatchObject({
      sessionId: "session-5",
    });
  });

  test("does not register the notifier when disabled", async () => {
    const forge = { opencode: vi.fn(async () => ({ bridge: { notifier: "/tmp/notifier" } })) };
    // SAFETY: disabled setup reads only the supplied tui.notify option and no TUI API members.
    const integration = await NotifierIntegration({
      forge: forge as never,
      options: { value: { tui: { notify: false } } } as never,
      store: createEmptyPluginStore(),
    });

    // SAFETY: disabled setup returns before reading any TUI API members.
    expect(await integration.tui!({} as never)).toEqual({});
    expect(forge.opencode).not.toHaveBeenCalled();
  });

  test("allows the Forge terminal environment to enable notifications", async () => {
    const previous = process.env.FORGE_OPENCODE_NOTIFY;
    process.env.FORGE_OPENCODE_NOTIFY = "1";
    try {
      const forge = { opencode: vi.fn(async () => ({ bridge: { notifier: "/tmp/notifier" } })) };
      const api = {
        event: { on: vi.fn(() => () => {}) },
        lifecycle: { onDispose: vi.fn(() => () => {}) },
        renderer: { on: vi.fn(() => {}), off: vi.fn(() => {}) },
      };
      // SAFETY: the focused fakes implement every Forge, option, and TUI API used during setup.
      const integration = await NotifierIntegration({
        forge: forge as never,
        options: { value: { tui: { notify: false } } } as never,
        store: createEmptyPluginStore(),
      });
      // SAFETY: notifier setup reads only the event, lifecycle, and renderer members provided.
      await integration.tui!(api as never);

      expect(forge.opencode).toHaveBeenCalledTimes(1);
      expect(api.event.on).toHaveBeenCalledWith("session.idle", expect.any(Function));
    } finally {
      if (previous === undefined) delete process.env.FORGE_OPENCODE_NOTIFY;
      else process.env.FORGE_OPENCODE_NOTIFY = previous;
    }
  });

  test("silently ignores a missing bridge path", () => {
    expect(() => emitIdleEvent("  ", "session-3")).not.toThrow();
  });

  test("emits without metadata when the session is unavailable", async () => {
    const bridgeFile = await temporaryBridge();

    emitIdleEvent(bridgeFile, "session-4");

    const payload: DoneNotifierPayload = JSON.parse(await readFile(bridgeFile, "utf8"));
    expect(payload.sessionId).toBe("session-4");
    expect(payload.title).toBeUndefined();
    expect(payload.directory).toBeUndefined();
  });
});

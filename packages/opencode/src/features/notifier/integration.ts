import type { TuiPluginApi } from "@opencode-ai/plugin/tui";

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type { Integration } from "../../plugin/integrations/types";

export type DoneNotifierPayload = {
  v: 1;
  type: "session.idle";
  sessionId: string;
  title?: string;
  directory?: string;
  finishedAt: number;
};

type SessionMetadata = {
  directory: string;
  title: string;
};

export function emitIdleEvent(bridgeFile: string, sessionId: string, session?: SessionMetadata) {
  if (!bridgeFile.trim()) return;

  const payload: DoneNotifierPayload = {
    v: 1,
    type: "session.idle",
    sessionId,
    title: session?.title.trim() || undefined,
    directory: session?.directory.trim() || undefined,
    finishedAt: Date.now(),
  };

  try {
    mkdirSync(dirname(bridgeFile), { recursive: true });
    appendFileSync(bridgeFile, `${JSON.stringify(payload)}\n`, "utf8");
  } catch {
    // Notification bridge failures must never disturb the OpenCode session.
  }
}

function registerNotifier(api: TuiPluginApi, bridgeFile: string) {
  let focused: boolean | undefined;
  const onFocus = () => {
    focused = true;
  };
  const onBlur = () => {
    focused = false;
  };
  api.renderer.on("focus", onFocus);
  api.renderer.on("blur", onBlur);

  const unsubscribe = api.event.on("session.idle", (event) => {
    const sessionId = event.properties.sessionID;
    const route = api.route.current;
    // SAFETY: the TUI host's named session route always carries a string sessionID.
    const currentSessionId =
      route.name === "session"
        ? (route as { params: { sessionID: string } }).params.sessionID
        : null;
    if (focused === true && currentSessionId === sessionId) return;

    emitIdleEvent(bridgeFile, sessionId, api.state.session.get(sessionId));
  });

  api.lifecycle.onDispose(() => {
    unsubscribe();
    api.renderer.off("focus", onFocus);
    api.renderer.off("blur", onBlur);
  });
}

export const NotifierIntegration: Integration = async (forge, options) => ({
  tui: async (api) => {
    if (!options.value.tui.notify && process.env.FORGE_OPENCODE_NOTIFY !== "1") return {};

    const { bridge } = await forge.opencode();
    registerNotifier(api, bridge.notifier);
    return {};
  },
});

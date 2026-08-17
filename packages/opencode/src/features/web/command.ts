import type { KeyEvent, Renderable, TuiPluginApi } from "@opencode-ai/plugin/tui";
import type { Command } from "@opentui/keymap";

import { openSessionInWeb } from "./bridge";

export function WebCommand(
  api: TuiPluginApi,
  webFile: string,
  webUrl?: string,
): Command<Renderable, KeyEvent> {
  return {
    name: "forge:web",
    title: "Open session in Forge web",
    category: "Forge",
    namespace: "palette",
    slashName: "forge:web",
    run() {
      const route = api.route.current;
      if (route.name !== "session") {
        api.ui.toast({
          variant: "warning",
          title: "Open in Forge",
          message: "Open a session before running /forge:web.",
          duration: 2500,
        });
        return;
      }

      // SAFETY: the TUI host's named session route always carries a string sessionID.
      const sessionId = (route as { params: { sessionID: string } }).params.sessionID;
      const result = openSessionInWeb(api, webFile, sessionId, webUrl);
      api.ui.toast(
        result.ok
          ? {
              variant: "success",
              title: "Open in Forge",
              message: "Opening this session in Forge…",
              duration: 2000,
            }
          : {
              variant: "error",
              title: "Open in Forge",
              message: result.error,
              duration: 4000,
            },
      );
    },
  };
}

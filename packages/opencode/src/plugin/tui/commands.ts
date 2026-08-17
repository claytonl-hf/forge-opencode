import type { TuiPluginApi } from "@opencode-ai/plugin/tui";

import type { TuiCommand } from "../integrations/types";

export function registerCommands(api: TuiPluginApi, commands: TuiCommand[]) {
  if (commands.length > 0) api.keymap.registerLayer({ commands, bindings: [] });
}

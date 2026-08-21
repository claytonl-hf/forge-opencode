import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui";

import { createForge } from "@forge/core";

import { useIntegrations } from "#plugin/integrations/registry";
import { useForgeOptions } from "#plugin/options";

import { registerCommands } from "./commands";
import { registerSlots } from "./slots";

export const tui: TuiPlugin = async (api) => {
  const forge = await createForge();
  const options = await useForgeOptions(api.state.path.directory);
  const integrations = await useIntegrations(forge, options);
  const output = await integrations.tui(api);

  registerCommands(api, output.commands);
  registerSlots(api, output.slots);
};

const plugin: TuiPluginModule = {
  id: "forge:tui",
  tui,
};

export default plugin;

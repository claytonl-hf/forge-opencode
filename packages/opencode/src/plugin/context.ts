import type Forge from "@forge/core";

import type { UseForgeOptions } from "#plugin/options";
import type { PluginStore } from "#plugin/store";

export type PluginContext = {
  forge: Forge;
  options: UseForgeOptions;
  store: PluginStore;
};

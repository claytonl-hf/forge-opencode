import type { TuiHostSlotMap, TuiPluginApi, TuiSlotPlugin } from "@opencode-ai/plugin/tui";

import type { TuiSlots } from "#plugin/integrations/types";
import type { ForgeOptions, UseForgeOptions } from "#plugin/options";

import { createSidebar, sidebarPlugin } from "./sidebar";

export type ComponentOption = keyof Exclude<ForgeOptions["tui"]["components"], boolean>;

export function isComponentEnabled(options: UseForgeOptions, component: ComponentOption) {
  const components = options.value.tui?.components;
  return components === true || (components !== false && components[component] !== false);
}

export function registerSlots(api: TuiPluginApi, contributions: TuiSlots[]) {
  for (const contribution of contributions) {
    const slots: TuiSlotPlugin["slots"] = {};
    // SAFETY: TuiSlots keys are constrained to host slot names; Object.keys erases them.
    for (const name of Object.keys(contribution) as (keyof TuiHostSlotMap)[]) {
      if (name === "sidebar_content") continue;
      const slot = contribution[name];
      if (slot && !Array.isArray(slot)) Object.assign(slots, { [name]: slot });
    }
    if (Object.keys(slots).length > 0) api.slots.register({ slots });
  }

  const sidebar = createSidebar(contributions);
  if (sidebar) api.slots.register(sidebarPlugin(sidebar));
}

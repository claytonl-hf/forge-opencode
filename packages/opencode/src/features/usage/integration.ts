import type { PluginContext } from "#plugin/context";
import type { Integration } from "#plugin/integrations/types";

import { startUsageGateDialog } from "./dialog";
import { createUsageSessionHooks } from "./session";

export async function UsageIntegration({ store, options }: PluginContext): ReturnType<Integration> {
  await store.models.refresh().catch(() => ({}));

  return {
    server: async () => createUsageSessionHooks(store),
    tui: async (api) => {
      startUsageGateDialog(api, store);
      const [{ UsageSlots }, { isComponentEnabled }] = await Promise.all([
        import("./slot"),
        import("#plugin/tui/slots"),
      ]);
      return {
        slots: isComponentEnabled(options, "usage") ? UsageSlots(store) : {},
      };
    },
  };
}

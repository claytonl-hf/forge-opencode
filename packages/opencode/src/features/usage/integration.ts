import type { Integration } from "#plugin/integrations/types";

import { startUsageGateDialog } from "./dialog";
import { createUsageSessionHooks } from "./session";

export async function UsageIntegration(
  forge: Parameters<Integration>[0],
  options: Parameters<Integration>[1],
): ReturnType<Integration> {
  const catalog = await forge.models().catch(() => ({}));

  return {
    server: async () => createUsageSessionHooks(forge, catalog),
    tui: async (api) => {
      startUsageGateDialog(api, forge, catalog);
      const [{ UsageSlots }, { isComponentEnabled }] = await Promise.all([
        import("./slot"),
        import("#plugin/tui/slots"),
      ]);
      return {
        slots: isComponentEnabled(options, "usage") ? UsageSlots(api, forge) : {},
      };
    },
  };
}

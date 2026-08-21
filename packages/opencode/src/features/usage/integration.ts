import type { Integration } from "../../plugin/integrations/types";

import { startUsageGateDialog } from "./dialog";
import { createUsageSessionHooks } from "./session";

export const UsageIntegration: Integration = async (forge, options) => {
  const catalog = await forge.models().catch(() => ({}));

  return {
    server: async () => createUsageSessionHooks(forge, catalog),
    tui: async (api) => {
      startUsageGateDialog(api, forge, catalog);
      const [{ UsageSlots }, { isComponentEnabled }] = await Promise.all([
        import("./slot"),
        import("../../plugin/tui/slots"),
      ]);
      return {
        slots: isComponentEnabled(options, "usage") ? UsageSlots(api, forge) : {},
      };
    },
  };
};

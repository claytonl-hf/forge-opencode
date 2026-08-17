import type { Integration } from "../../plugin/integrations/types";

export const UsageIntegration: Integration = async (forge, options) => ({
  tui: async (api) => {
    const [{ UsageSlots }, { isComponentEnabled }] = await Promise.all([
      import("./slot"),
      import("../../plugin/tui/slots"),
    ]);
    return {
      slots: isComponentEnabled(options, "usage") ? UsageSlots(api, forge) : {},
    };
  },
});

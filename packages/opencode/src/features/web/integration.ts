import type { Integration } from "../../plugin/integrations/types";

export const WebIntegration: Integration = async (forge, options) => ({
  tui: async (api) => {
    const [{ bridge }, { WebCommand }, { WebSlot }, { isComponentEnabled }] = await Promise.all([
      forge.opencode(),
      import("./command"),
      import("./slot"),
      import("../../plugin/tui/slots"),
    ]);
    return {
      commands: [WebCommand(api, bridge.web.file, bridge.web.url)],
      slots: isComponentEnabled(options, "web")
        ? { sidebar_content: [WebSlot(api, bridge.web)] }
        : {},
    };
  },
});

import type { Integration } from "#plugin/integrations/types";

export async function WebIntegration(
  forge: Parameters<Integration>[0],
  options: Parameters<Integration>[1],
): ReturnType<Integration> {
  return {
    tui: async (api) => {
      const [{ bridge }, { WebCommand }, { WebSlot }, { isComponentEnabled }] = await Promise.all([
        forge.opencode(),
        import("./command"),
        import("./slot"),
        import("#plugin/tui/slots"),
      ]);
      return {
        commands: [WebCommand(api, bridge.web.file, bridge.web.url)],
        slots: isComponentEnabled(options, "web")
          ? { sidebar_content: [WebSlot(api, bridge.web)] }
          : {},
      };
    },
  };
}

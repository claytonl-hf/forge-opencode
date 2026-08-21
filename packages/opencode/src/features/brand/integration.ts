import { exists } from "@forge/core/utils";
import { join } from "node:path";

import type { Integration } from "../../plugin/integrations/types";

export const BrandIntegration: Integration = async (forge, options) => ({
  tui: async (api) => {
    const [{ Home }, { isComponentEnabled }, resources] = await Promise.all([
      import("./home"),
      import("../../plugin/tui/slots"),
      forge.opencode(),
    ]);

    if (options.value.tui?.theme) {
      const themeName = "forge";
      const themeJson = join(resources.directories.themes, `${themeName}.json`);
      if (await exists(themeJson)) {
        await api.theme.install(themeJson);
        api.theme.set(themeName);
      }
    }

    return {
      slots: isComponentEnabled(options, "logo") ? { home_logo: Home } : {},
    };
  },
});

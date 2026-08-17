import type { Integration } from "../../plugin/integrations/types";

export const ProfileIntegration: Integration = async (forge, forgeOptions) => {
  const options = forgeOptions.value;
  const provider = await forge.provider();

  return {
    server: async (_) => ({
      async config(config) {
        if (!provider || !options.profiles || !options.profile) {
          return;
        }

        const profile = options.profiles[options.profile];

        if (!profile) {
          return;
        }

        for (const [key, model] of Object.entries(profile.models)) {
          if (key === "$default") {
            config.model = `${provider.id}/${model.id}`;
            continue;
          }
          if (key === "$small") {
            config.small_model = `${provider.id}/${model.id}`;
            continue;
          }
          if (config.agent && config.agent[key]) {
            config.agent[key].model = `${provider.id}/${model.id}`;
            if (model.variant === null) {
              delete config.agent[key].variant;
            } else {
              config.agent[key].variant = model.variant;
            }
          }
        }
      },
    }),
    tui: async (api) => {
      const { ProfileCommand } = await import("./command");

      return {
        commands: [ProfileCommand(api, forgeOptions)],
      };
    },
  };
};

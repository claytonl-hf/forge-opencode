import type { Integration } from "../../plugin/integrations/types";

import { onTuiSessionCreated } from "./pending";
import { createProfileSessionHooks, type ProfileSessionClient } from "./session";

export const ProfileIntegration: Integration = async (forge, forgeOptions) => {
  const options = forgeOptions.value;
  const provider = await forge.provider();

  return {
    server: async ({ client, directory }) => {
      const profileClient: ProfileSessionClient = {
        session: {
          get: ({ path, query }) => client.session.get({ path, query }),
        },
      };

      return {
        ...createProfileSessionHooks({
          client: profileClient,
          directory,
          getOptions: () => forgeOptions.value,
          getProfiles: () => forgeOptions.value.profiles,
        }),
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
      };
    },
    tui: async (api) => {
      const [{ ProfileCommand }, { ProfileSlots }, { isComponentEnabled }] = await Promise.all([
        import("./command"),
        import("./slot"),
        import("../../plugin/tui/slots"),
      ]);
      api.event.on("session.created", (event) => {
        const info = event.properties.info;
        void onTuiSessionCreated({
          sessionID: info.id,
          parentID: info.parentID,
          agent: info.agent,
          metadata: info.metadata,
          profiles: forgeOptions.value.profiles ?? {},
          getParent: async (id) => api.state.session.get(id),
          update: async (sessionID, metadata) => {
            await api.client.session.update({ sessionID, metadata });
          },
          switchModel: async (sessionID, model) => {
            await api.client.v2.session.switchModel({ sessionID, model }, { throwOnError: true });
          },
        });
      });

      return {
        commands: [ProfileCommand(api, forgeOptions)],
        slots: isComponentEnabled(forgeOptions, "profile") ? ProfileSlots(api, forgeOptions) : {},
      };
    },
  };
};

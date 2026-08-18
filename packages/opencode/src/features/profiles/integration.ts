import { createOpencodeClient } from "@opencode-ai/sdk/v2";

import type { Integration } from "../../plugin/integrations/types";

import { createProfileSessionHooks, type ProfileSessionClient } from "./session";

export const ProfileIntegration: Integration = async (forge, forgeOptions) => {
  const options = forgeOptions.value;
  const provider = await forge.provider();

  return {
    server: async ({ client, directory, serverUrl }) => {
      const v2 = createOpencodeClient({ baseUrl: serverUrl.origin, directory });
      const profileClient: ProfileSessionClient = {
        session: {
          get: ({ path, query }) => client.session.get({ path, query }),
          update: async ({ path, query, body }) => {
            // SAFETY: the v1 client accepts metadata at runtime; its generated types omit it.
            await client.session.update({ path, query, body } as Parameters<
              typeof client.session.update
            >[0]);
          },
          switchModel: async ({ sessionID, model }) => {
            await v2.v2.session.switchModel({ sessionID, model }, { throwOnError: true });
          },
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
      const { ProfileCommand } = await import("./command");

      return {
        commands: [ProfileCommand(api, forgeOptions)],
      };
    },
  };
};

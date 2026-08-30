import type { ModelRef } from "@opencode-ai/sdk/v2";

import type { Integration } from "#plugin/integrations/types";

import { onTuiSessionCreated } from "./lifecycle";
import { createProfileSessionListener } from "./listener";
import { createProfileSessionHooks, type ProfileSessionClient } from "./session";

export const ProfileIntegration: Integration = async ({ forge, store, options }) => {
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
          getGlobalProfile: () => options.value.profile,
          getProfiles: () => options.value.profiles,
        }),
        async config(config) {
          const profileName = options.value.profile;
          if (!provider || !options.value.profiles || !profileName) {
            return;
          }

          const profile = options.value.profiles[profileName];

          if (!profile) {
            return;
          }

          for (const [key, model] of Object.entries(profile.models)) {
            const providerID = model.provider ?? provider.id;
            if (key === "$default") {
              config.model = `${providerID}/${model.id}`;
              continue;
            }
            if (key === "$small") {
              config.small_model = `${providerID}/${model.id}`;
              continue;
            }

            config.agent = config.agent ?? {};
            config.agent[key] = config.agent[key] ?? {};
            config.agent[key].model = `${providerID}/${model.id}`;

            if (model.variant === null) {
              delete config.agent[key].variant;
            } else if (model.variant !== undefined) {
              config.agent[key].variant = model.variant;
            }
          }
        },
      };
    },
    tui: async (api) => {
      const [{ ProfileCommand }, { ProfileSlots }, { isComponentEnabled }] = await Promise.all([
        import("./command"),
        import("./slot"),
        import("#plugin/tui/slots"),
      ]);
      const disposeCreatedListener = api.event.on("session.created", (event) => {
        const info = event.properties.info;
        const model: ModelRef | undefined = info.model
          ? { id: info.model.id, providerID: info.model.providerID }
          : undefined;
        if (model && info.model?.variant != null) model.variant = info.model.variant;
        void onTuiSessionCreated({
          sessionID: info.id,
          parentID: info.parentID,
          agent: info.agent,
          model,
          metadata: info.metadata,
          profiles: options.value.profiles ?? {},
          store,
          getParent: async (id) => api.state.session.get(id),
          update: async (sessionID, metadata) => {
            await api.client.session.update({ sessionID, metadata });
          },
          switchModel: async (sessionID, model) => {
            await api.client.v2.session.switchModel({ sessionID, model }, { throwOnError: true });
          },
        });
      });
      api.lifecycle?.onDispose(disposeCreatedListener);
      const disposeSessionListener = api.event.on(
        "session.updated",
        createProfileSessionListener({
          getProfiles: () => options.value.profiles,
          update: async (sessionID, metadata) => {
            await api.client.session.update({ sessionID, metadata });
          },
        }),
      );
      api.lifecycle?.onDispose(disposeSessionListener);

      return {
        commands: [ProfileCommand(api, options, store)],
        slots: isComponentEnabled(options, "profile") ? ProfileSlots(api, options, store) : {},
      };
    },
  };
};

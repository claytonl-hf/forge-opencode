import type { Integration } from "../../plugin/integrations/types";

import { configureAgents, type ConfigAgent, type ConfigProvider } from "../../platform/config";

export const ModelsIntegration: Integration = async (forge, { value: options }) => {
  const [provider, models] = await Promise.all([forge.provider(), forge.models()]);

  return {
    server: async () => ({
      config: async (config) => {
        if (!provider) return;

        config.provider ??= {};
        config.provider[provider.id] = {
          name: provider.name,
          npm: provider.package,
          api: provider.api.endpoint,
          // SAFETY: models is passed through unchanged from forge.models().
          models: models as ConfigProvider["models"],
          options: {
            baseURL: provider.api.endpoint,
            apiKey: provider.api.key,
            headers: provider.api.headers,
          },
        };

        if (
          Array.isArray(config.enabled_providers) &&
          !config.enabled_providers.includes(provider.id)
        ) {
          config.enabled_providers.push(provider.id);
        }

        const fromPlugin: Record<string, ConfigAgent> =
          options.agents === false
            ? {}
            : await forge
                .agents()
                .catch(() => ({}))
                .then((agents) => {
                  if (!Array.isArray(options.agents)) return agents;

                  for (const name in agents) {
                    if (!options.agents.includes(name)) {
                      // SAFETY: name is produced by enumerating agents itself.
                      delete agents[name as keyof typeof agents];
                    }
                  }
                  return agents;
                });
        const fromUser = Object.fromEntries(
          Object.entries(config.agent ?? {}).filter(
            (entry): entry is [string, Exclude<(typeof entry)[1], undefined>] =>
              entry[1] !== undefined,
          ),
        );
        config.agent = configureAgents(fromPlugin, fromUser);
      },
    }),
  };
};

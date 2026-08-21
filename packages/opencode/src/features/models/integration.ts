import type { Integration } from "#plugin/integrations/types";

import { configureAgents, type ConfigAgent } from "#platform/config";

export async function ModelsIntegration(
  forge: Parameters<Integration>[0],
  { value: options }: Parameters<Integration>[1],
): ReturnType<Integration> {
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
          models: Object.fromEntries(
            Object.entries(models).map(([id, model]) => [
              id,
              {
                ...model,
                experimental: Boolean(model.experimental),
                provider: model.provider?.npm ? { npm: model.provider.npm } : undefined,
              },
            ]),
          ),
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

                  const selectedAgents = options.agents;
                  return Object.fromEntries(
                    Object.entries(agents).filter(([name]) => selectedAgents.includes(name)),
                  );
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
}

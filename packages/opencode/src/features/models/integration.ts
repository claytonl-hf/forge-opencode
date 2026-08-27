import type { ReasoningOption } from "@opencode-ai/models";

import type { PluginContext } from "#plugin/context";
import type { Integration } from "#plugin/integrations/types";

import { configureAgents, type ConfigAgent } from "#platform/config";

function getModelVariants(model: { reasoning_options?: ReasoningOption[] }) {
  const variants: Record<string, { reasoning: { effort: string } }> = {};
  const effort = model.reasoning_options?.find(
    (option): option is Extract<ReasoningOption, { type: "effort" }> => option.type === "effort",
  );

  if (effort) {
    for (const value of effort.values) {
      if (value && value.length > 0) {
        variants[value] = { reasoning: { effort: value } };
      }
    }
  }

  return variants;
}

export async function ModelsIntegration({
  forge,
  store,
  options: forgeOptions,
}: PluginContext): ReturnType<Integration> {
  const { value: options } = forgeOptions;
  const [provider, models] = await Promise.all([forge.provider(), store.models.refresh()]);

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
            Object.entries(models).map(([id, model]) => {
              const variants = getModelVariants(model);
              return [
                id,
                {
                  ...model,
                  experimental: Boolean(model.experimental),
                  provider: model.provider?.npm ? { npm: model.provider.npm } : undefined,
                  ...(Object.keys(variants).length > 0 ? { variants } : undefined),
                },
              ];
            }),
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

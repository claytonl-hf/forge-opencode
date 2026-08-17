import { Models, type Model } from "@opencode-ai/models";

type ModelVariant = { reasoning: { effort: string } };

function getVariants(efforts: string[]): Record<string, ModelVariant> {
  return Object.fromEntries(efforts.map((effort) => [effort, { reasoning: { effort } }]));
}

const ModelVariants = {
  "z-ai/glm-5.2": getVariants(["high", "xhigh"]),
  "x-ai/grok-4.5": getVariants(["low", "medium", "high"]),
  "anthropic/claude-sonnet-5": getVariants(["low", "medium", "high", "xhigh", "max"]),
  "google/gemini-3.1-flash-lite": getVariants(["minimal", "low", "medium", "high"]),
  "moonshotai/kimi-k3": getVariants(["low", "high", "max"]),
  "openai/gpt-5.6-luna": getVariants(["none", "low", "medium", "high", "xhigh", "max"]),
  "openai/gpt-5.6-terra": getVariants(["none", "low", "medium", "high", "xhigh", "max"]),
  "anthropic/claude-opus-5": getVariants(["low", "medium", "high", "xhigh", "max"]),
  "deepseek/deepseek-v4-flash-0731": getVariants(["low", "high", "max"]),
  "x-ai/grok-4.6": getVariants(["low", "medium", "high", "xhigh"]),
} satisfies Record<string, Record<string, ModelVariant>>;

const ModelProviders = Models.make()
  .providers({ signal: AbortSignal.timeout(8_000) })
  .catch(async () => (await import("@opencode-ai/models/snapshot")).providers);
const ModelProperties = [
  "id",
  "name",
  "cost",
  "limit",
  "tool_call",
  "reasoning",
  "reasoning_options",
  "temperature",
  "modalities",
  "attachment",
] as const;

type ModelProperty = (typeof ModelProperties)[number];
type BaseModelData = Pick<Model, ModelProperty>;
type ModelData = BaseModelData & { variants?: Record<string, ModelVariant> };

export async function getModels(
  list: Array<Partial<Model> & { id: string; name: string }>,
): Promise<Record<string, ModelData>> {
  const { openrouter } = await ModelProviders;

  if (!openrouter || !openrouter.models) {
    return {};
  }

  const models: Record<string, ModelData> = {};

  for (const item of list) {
    // SAFETY: id and name are required by the input; remaining model fields are optional upstream.
    models[item.id] = { ...item } as ModelData;

    if (item.id in openrouter.models) {
      const source = openrouter.models[item.id]!;
      // SAFETY: entries are generated from the complete, fixed ModelProperties tuple.
      const data = Object.fromEntries(
        ModelProperties.map((prop) => [prop, source[prop]]),
      ) as BaseModelData;

      models[item.id] = {
        ...data,
        ...item,
        name: data.name || item.name,
      };
    }

    if (item.id in ModelVariants) {
      // SAFETY: the membership check above proves item.id is a ModelVariants key.
      models[item.id]!.variants = ModelVariants[item.id as keyof typeof ModelVariants]!;
    }
  }

  return models;
}

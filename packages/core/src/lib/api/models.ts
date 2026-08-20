import { Models, type Model, type ReasoningEffort } from "@opencode-ai/models";
import { z } from "zod";

const BudgetSchema = z.object({
  exhausted: z.boolean(),
  spentUsd: z.number(),
  dailyBudgetUsd: z.number(),
  remainingUsd: z.number(),
  enforced: z.boolean(),
});

const ModelBandSchema = z.enum(["$", "$$", "$$$"]);
const ModelCapabilitiesSchema = z.enum(["text", "images", "tools", "docs"]);
const ModelCostTierSchema = z.enum(["low", "mid", "high"]);
const ModelSpeedTierSchema = z.enum(["fast", "medium", "slow"]);
const ModelReasoningSchema = z.custom<ReasoningEffort>(
  (value) => z.string().safeParse(value).success,
);

const ForgeModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
  limit: z.object({
    context: z.number().positive().int(),
    output: z.number().positive().int(),
  }),
  group: z.string(),
  visionCapable: z.boolean().optional(),
  intelligence: z.number().positive().int(),
  speedTier: ModelSpeedTierSchema,
  tokensPerSec: z.number().positive().int(),
  costTier: ModelCostTierSchema,
  band: ModelBandSchema,
  costInput: z.number(),
  costOutput: z.number(),
  contextLimit: z.number().positive().int(),
  outputLimit: z.number().positive().int(),
  tags: z.array(z.string()),
  capabilities: z.array(ModelCapabilitiesSchema),
  reasoningModes: z.array(ModelReasoningSchema).optional(),
  reasoningDefault: ModelReasoningSchema.optional(),
});

const ForgeCatalogSchema = z.object({
  models: z.array(ForgeModelSchema),
  defaultModelId: z.string().optional(),
  agents: z.array(
    z.object({
      role: z.string(),
      model: z.string(),
      reasoningEffort: ModelReasoningSchema.optional(),
    }),
  ),
});

export const ModelsResponseSchema = z.looseObject({
  source: z.string(),
  localModelsMerged: z.boolean(),
  reasoningEfforts: z.array(ModelReasoningSchema),
  opencode: ForgeCatalogSchema,
  budget: BudgetSchema,
});

type ForgeModel = z.infer<typeof ForgeModelSchema>;

type ModelMetadata = {
  cost: { tier: string; band: string };
  speed: { rate: number; tier: string };
};

type ModelItem = Model & { metadata: ModelMetadata };
type ModelList = Record<string, ModelItem>;

export async function getModels(input: ForgeModel[]): Promise<ModelList> {
  const models: ModelList = {};
  const { openrouter } = await Models.make()
    .providers({ signal: AbortSignal.timeout(8_000) })
    .catch(async () => (await import("@opencode-ai/models/snapshot")).providers);

  for (const item of input) {
    const data = openrouter?.models[item.id];
    const metadata: ModelMetadata = {
      cost: {
        tier: item.costTier,
        band: item.band,
      },
      speed: {
        rate: item.tokensPerSec,
        tier: item.speedTier,
      },
    };

    if (!data) {
      // SAFETY: we skip models that are not in OpenRouter.
      continue;
    }

    const model: ModelItem = {
      ...data,
      id: item.id,
      name: item.name,
      description: data?.description ?? "",
      attachment: data?.attachment ?? item.capabilities.includes("docs"),
      tool_call: data?.tool_call ?? item.capabilities.includes("tools"),
      reasoning: data?.reasoning ?? !!item.reasoningModes?.length,
      limit: { ...data?.limit, context: item.contextLimit, output: item.outputLimit },
      cost: { ...data?.cost, input: item.costInput, output: item.costOutput },
      reasoning_options: item.reasoningModes
        ? [{ type: "effort", values: item.reasoningModes }]
        : undefined,
      metadata,
    };

    models[item.id] = model;
  }

  return models;
}

export type ForgeModels = Awaited<ReturnType<typeof getModels>>;

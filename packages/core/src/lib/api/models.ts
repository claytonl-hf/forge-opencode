import { type ReasoningEffort } from "@opencode-ai/models";
import { z } from "zod";

const BudgetSchema = z.object({
  exhausted: z.boolean(),
  spentUsd: z.number(),
  dailyBudgetUsd: z.number(),
  remainingUsd: z.number(),
  enforced: z.boolean(),
});

const ModelBandSchema = z.enum(["$", "$$", "$$$"]);
const ModelCapabilitiesSchema = z.enum(["text", "images", "tools", "docs", "video"]);
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

export const ForgeCatalogSchema = z.object({
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

export type ForgeModelBand = z.infer<typeof ModelBandSchema>;
export type ForgeModelCostTier = z.infer<typeof ModelCostTierSchema>;
export type ForgeModelSpeedTier = z.infer<typeof ModelSpeedTierSchema>;

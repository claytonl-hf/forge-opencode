import { Models, type Model } from "@opencode-ai/models";
import { z } from "zod";

import { ForgeCatalogSchema } from "#lib/api/models";
import { sortKeys } from "#lib/utils.ts";

type ModelCatalog = z.infer<typeof ForgeCatalogSchema>;
type ModelDefinition = ModelCatalog["models"][number];
type ModelMetadata = {
  cost: { tier: string; band: string };
  speed: { rate: number; tier: string };
};

export type ForgeModel = Model & { metadata: ModelMetadata };
export type ForgeModels = Record<string, ForgeModel>;

function fromCatalog(item: ModelDefinition): Model {
  const input = item.capabilities.flatMap((capability: string) => {
    if (capability === "text") return ["text" as const];
    if (capability === "images") return ["image" as const];
    if (capability === "docs") return ["pdf" as const];
    if (capability === "video") return ["video" as const];
    return [];
  });

  return {
    id: item.id,
    name: item.name,
    description: "",
    attachment: item.capabilities.includes("docs"),
    reasoning: !!item.reasoningModes?.length,
    tool_call: item.capabilities.includes("tools"),
    release_date: "",
    last_updated: "",
    modalities: { input: input.length ? input : ["text"], output: ["text"] },
    open_weights: false,
    limit: { context: item.contextLimit, output: item.outputLimit },
    cost: { input: item.costInput, output: item.costOutput },
    reasoning_options: item.reasoningModes
      ? [{ type: "effort", values: item.reasoningModes }]
      : undefined,
  };
}

export async function getModels(input: ModelDefinition[]): Promise<ForgeModels> {
  const models: ForgeModels = {};
  const { openrouter } = await Models.make()
    .providers({ signal: AbortSignal.timeout(250) })
    .catch(async () => (await import("@opencode-ai/models/snapshot")).providers);

  for (const item of input) {
    const data = openrouter?.models[item.id] ?? fromCatalog(item);
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

    const model: ForgeModel = {
      ...data,
      id: item.id,
      name: item.name,
      description: data.description ?? "",
      attachment: data.attachment ?? item.capabilities.includes("docs"),
      tool_call: data.tool_call ?? item.capabilities.includes("tools"),
      reasoning: data.reasoning ?? Boolean(item.reasoningModes?.length),
      limit: {
        ...data.limit,
        context: item.contextLimit,
        output: item.outputLimit,
      },
      cost: {
        ...data.cost,
        input: item.costInput,
        output: item.costOutput,
      },
      reasoning_options: item.reasoningModes
        ? [{ type: "effort", values: item.reasoningModes }]
        : data.reasoning_options,
      metadata,
    };

    models[item.id] = model;
  }

  return sortKeys(models);
}

export async function getModelsFromCatalog(catalog: ModelCatalog): Promise<ForgeModels> {
  return getModels(ForgeCatalogSchema.parse(catalog).models);
}

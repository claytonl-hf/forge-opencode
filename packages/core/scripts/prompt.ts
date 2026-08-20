import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";

import { type Forge } from "../src";

type ForgeProvider = NonNullable<Awaited<ReturnType<Forge["provider"]>>>;

async function createProvider({ api }: ForgeProvider) {
  const openrouter = createOpenRouter({
    apiKey: api.key,
    baseURL: api.endpoint,
    headers: api.headers,
  });

  return openrouter;
}

export async function prompt(
  provider: ForgeProvider,
  model: string,
  prompt: string,
  options?: {
    reasoningEffort?: "low" | "medium" | "high" | "minimal" | "none" | "xhigh";
  },
) {
  const openrouter = await createProvider(provider);
  const selectedModel = openrouter(model);

  if (options?.reasoningEffort) {
    return generateText({
      model: selectedModel,
      prompt,
      providerOptions: {
        openrouter: {
          reasoning: {
            effort: options.reasoningEffort,
          },
        },
      },
    });
  }

  return generateText({ model: selectedModel, prompt });
}

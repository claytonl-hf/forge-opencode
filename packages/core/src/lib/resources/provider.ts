import { z } from "zod";

import type { ForgeEnvironmentVariables } from "#lib/api/env";

const ForgeProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  package: z.string(),
  api: z.object({
    endpoint: z.string(),
    key: z.string(),
    headers: z.record(z.string(), z.string()),
  }),
});

export type ForgeProvider = z.infer<typeof ForgeProviderSchema>;

export function createProvider(env: ForgeEnvironmentVariables) {
  return ForgeProviderSchema.parse({
    id: "forge",
    name: "Forge",
    package: "@openrouter/ai-sdk-provider",
    api: {
      endpoint: env.FORGE_OPENROUTER_BROKER_BASE_URL,
      key: env.FORGE_SUPABASE_ACCESS_TOKEN,
      headers: {
        "HTTP-Referer": "https://forge.humanforce.com",
        "X-Title": "Forge OpenCode",
      },
    },
  });
}

import { z } from "zod";

import type { getModels } from "./models";

export const ForgeStatus = z.looseObject({
  ok: z.boolean(),
  version: z.string(),
  signedIn: z.boolean(),
});
export type ForgeStatus = z.infer<typeof ForgeStatus>;

export const ForgeEnvironment = z.looseObject({
  signedIn: z.boolean(),
  opencodeBin: z.string(),
  env: z.looseObject({
    FORGE_MCP_URL: z.string(),
    FORGE_MCP_TOKEN: z.string(),
    FORGE_OPENROUTER_BROKER_BASE_URL: z.string(),
    FORGE_SUPABASE_ACCESS_TOKEN: z.string(),
    FORGE_OPENCODE_MODEL_CATALOG_JSON: z.string(),
    FORGE_TERMINAL_BOOTSTRAP_DIR: z.string(),
    FORGE_OPENCODE_WRITE_PERMISSIONS_JSON: z.string(),
    FORGE_OPENCODE_WEB_BRIDGE_FILE: z.string(),
    FORGE_OPENCODE_DONE_NOTIFIER_FILE: z.string(),
    FORGE_OPENCODE_ATTACH_URL: z.string().optional(),
    FORGE_USAGE_SNAPSHOT_FILE: z.string().optional(),
  }),
});
export type ForgeEnvironment = z.infer<typeof ForgeEnvironment>;

export const ForgeOpenCode = z.object({
  bin: z.string(),
  directories: z.object({
    agents: z.string(),
    commands: z.string(),
    themes: z.string(),
    plugins: z.string(),
  }),
  permissions: z.array(z.string()),
  bridge: z.object({
    web: z.object({
      file: z.string(),
      url: z.string().optional(),
    }),
    notifier: z.string(),
  }),
});
export type ForgeOpenCode = z.infer<typeof ForgeOpenCode>;

export const ForgeCatalog = z.looseObject({
  source: z.string(),
  defaultModelId: z.string(),
  models: z.array(
    z.looseObject({
      id: z.string(),
      name: z.string(),
      isDefault: z.boolean(),
      limit: z.looseObject({
        context: z.number(),
        output: z.number(),
      }),
    }),
  ),
  agents: z.array(
    z.looseObject({
      role: z.string(),
      model: z.string().optional(),
      reasoningEffort: z.string().optional(),
    }),
  ),
});
export type ForgeCatalog = z.infer<typeof ForgeCatalog>;

export type ForgeModels = Awaited<ReturnType<typeof getModels>>;
export type ForgeProvider = {
  id: string;
  name: string;
  package: string;
  api: {
    endpoint: string;
    key: string;
    headers: Record<string, string>;
  };
  models: ForgeModels;
};

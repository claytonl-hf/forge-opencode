import { z } from "zod";

export const EnvResponseSchema = z.looseObject({
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

export type ForgeEnvironment = z.infer<typeof EnvResponseSchema>;

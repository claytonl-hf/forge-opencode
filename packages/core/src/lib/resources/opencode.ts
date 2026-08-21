import { join } from "node:path";
import { z } from "zod";

import type { ForgeEnvironmentVariables } from "../api/env";

import { ForgeNotReady } from "../errors";
import { exists } from "../utils";

const ForgeOpenCodeSchema = z.object({
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

export type ForgeOpenCode = z.infer<typeof ForgeOpenCodeSchema>;

export async function createOpenCode(
  bin: string,
  env: ForgeEnvironmentVariables,
): Promise<ForgeOpenCode> {
  const bootstrap = env.FORGE_TERMINAL_BOOTSTRAP_DIR;
  const oc = ForgeOpenCodeSchema.parse({
    bin,
    directories: {
      agents: join(bootstrap, "opencode-agents"),
      commands: join(bootstrap, "opencode-commands"),
      themes: join(bootstrap, "opencode-themes"),
      plugins: join(bootstrap, "opencode-plugins"),
    },
    permissions: JSON.parse(env.FORGE_OPENCODE_WRITE_PERMISSIONS_JSON),
    bridge: {
      notifier: env.FORGE_OPENCODE_DONE_NOTIFIER_FILE,
      web: {
        file: env.FORGE_OPENCODE_WEB_BRIDGE_FILE,
        url: env.FORGE_OPENCODE_ATTACH_URL,
      },
    },
  });

  for (const [key, value] of Object.entries(oc.directories)) {
    if (!(await exists(value))) {
      throw new ForgeNotReady(`Forge OpenCode directory ${key} is not accessible at ${value}.`);
    }
  }

  return oc;
}

import { z } from "zod";

import type { ForgeModels } from "./api/models";

export type { ForgeEnvironment } from "./api/env";

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

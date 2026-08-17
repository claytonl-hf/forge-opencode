import { z } from "zod";

import { list } from "./markdown";

export const ForgeAgent = z.looseObject({
  description: z.string(),
  prompt: z.string(),
  mode: z.enum(["primary", "subagent", "all"]).optional(),
  model: z.string().optional(),
  variant: z.string().optional(),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  hidden: z.boolean().optional(),
  disabled: z.boolean().optional(),
  color: z.string().optional(),
  permission: z.record(z.string(), z.unknown()).optional(),
});
export type ForgeAgent = z.infer<typeof ForgeAgent>;

export async function listAgents(path: string) {
  return await list<ForgeAgent>(path, (data, prompt) => ForgeAgent.parse({ ...data, prompt }));
}

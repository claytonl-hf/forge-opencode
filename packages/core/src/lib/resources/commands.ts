import { z } from "zod";

import { list } from "./markdown";

export const ForgeCommand = z.object({
  description: z.string(),
  template: z.string(),
  model: z.string().optional(),
  agent: z.string().optional(),
  subtask: z.boolean().optional(),
});
export type ForgeCommand = z.infer<typeof ForgeCommand>;

export async function listCommands(path: string) {
  return await list<ForgeCommand>(path, (data, template) =>
    ForgeCommand.parse({ ...data, template }),
  );
}

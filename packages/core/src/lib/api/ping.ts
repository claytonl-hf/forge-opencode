import { z } from "zod";

export const PingResponseSchema = z.looseObject({
  ok: z.boolean(),
  version: z.string(),
  signedIn: z.boolean(),
});

export type ForgeStatus = z.infer<typeof PingResponseSchema>;

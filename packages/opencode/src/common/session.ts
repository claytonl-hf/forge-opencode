import { z } from "zod";

const SessionMetadataSchema = z.looseObject({});
export type SessionMetadata = z.infer<typeof SessionMetadataSchema>;

export function getSessionMetadata<T>(
  metadata: SessionMetadata | undefined,
  key: string,
  schema: z.ZodType<T>,
): T | undefined {
  const { success, data } = SessionMetadataSchema.extend({ [key]: schema }).safeParse(
    metadata || {},
  );

  return success ? data[key] : undefined;
}

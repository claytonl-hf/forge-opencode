import { createHash } from "node:crypto";
import fs, { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

import { ForgeNotRunning } from "./errors";

const HandshakeFile = join(homedir(), ".forge", "cli-handshake.json");
const HandshakeSchema = z.object({
  version: z.number().int().positive().default(1),
  host: z.string().default("127.0.0.1"),
  port: z.number().int().positive(),
  token: z.string().min(1),
  pid: z.number().int().positive(),
  appPath: z.string().min(1),
  started: z.iso.datetime({ offset: true }),
});
export type Handshake = z.infer<typeof HandshakeSchema>;

export async function handshake(
  file: string = HandshakeFile,
): Promise<Handshake & { hash: string }> {
  const exists = await access(file, fs.constants.R_OK)
    .then(() => true)
    .catch(() => false);

  if (!exists) {
    throw new ForgeNotRunning(`Forge handshake file is missing.`);
  }

  try {
    const contents = await readFile(file, "utf-8");
    const hash = createHash("sha256").update(contents).digest("hex");
    const data = HandshakeSchema.parse(JSON.parse(contents));

    return { hash, ...data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ForgeNotRunning(`Forge handshake file is malformed. ${message}`);
  }
}

import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ForgeNotRunning } from "../../src/lib/errors";
import { handshake } from "../../src/lib/handshake";

const directories: string[] = [];

type Fixture = { raw: string } | { data: object };

async function fixture(value: Fixture): Promise<{ file: string; contents: string }> {
  const directory = await mkdtemp(join(tmpdir(), "forge-handshake-"));
  directories.push(directory);
  const file = join(directory, "cli-handshake.json");
  const contents = "raw" in value ? value.raw : JSON.stringify(value.data);
  await writeFile(file, contents);
  return { file, contents };
}

const validHandshake = {
  version: 1,
  host: "127.0.0.1",
  port: 4312,
  token: "secret",
  pid: 1234,
  appPath: "/Applications/Forge.app/Contents/MacOS/Forge",
  started: "2026-08-15T10:00:00+08:00",
};

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("handshake", () => {
  test("parses a valid file and hashes its original contents", async () => {
    const { file, contents } = await fixture({ data: validHandshake });

    expect(await handshake(file)).toEqual({
      hash: createHash("sha256").update(contents).digest("hex"),
      ...validHandshake,
    });
  });

  test("applies defaults for version and host", async () => {
    const { version: _, host: __, ...withoutDefaults } = validHandshake;
    const { file } = await fixture({ data: withoutDefaults });

    expect(await handshake(file)).toMatchObject({ version: 1, host: "127.0.0.1" });
  });

  test("rejects a missing file", async () => {
    await expect(
      handshake(join(tmpdir(), `missing-handshake-${crypto.randomUUID()}`)),
    ).rejects.toBeInstanceOf(ForgeNotRunning);
  });

  test.each([
    ["invalid JSON", { raw: "{" }],
    ["an empty token", { data: { ...validHandshake, token: "" } }],
    ["a non-positive pid", { data: { ...validHandshake, pid: 0 } }],
    ["an invalid timestamp", { data: { ...validHandshake, started: "yesterday" } }],
  ])("rejects %s", async (_, value) => {
    const { file } = await fixture(value);

    await expect(handshake(file)).rejects.toThrow("Forge handshake file is malformed.");
  });
});

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { openSessionInWeb, type OpenWebPayload, writeOpenWebRequest } from "#features/web/bridge";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

async function temporaryBridge() {
  const directory = await mkdtemp(join(tmpdir(), "forge-web-"));
  temporaryDirectories.push(directory);
  return join(directory, "nested", "requests.jsonl");
}

describe("Forge web bridge", () => {
  test("writes the original open-web JSONL contract", async () => {
    const bridgeFile = await temporaryBridge();
    const payload: OpenWebPayload = {
      v: 1,
      action: "open-web",
      sessionId: "session-1",
      directory: "/worktree",
      baseUrl: "http://localhost:4096",
    };

    expect(writeOpenWebRequest(bridgeFile, payload)).toEqual({ ok: true });
    expect(JSON.parse(await readFile(bridgeFile, "utf8"))).toEqual(payload);
  });

  test("resolves session metadata independently of its command presentation", async () => {
    const bridgeFile = await temporaryBridge();
    const api = {
      state: {
        path: { directory: "/fallback" },
        session: { get: () => ({ directory: "/session-worktree" }) },
      },
    };

    // SAFETY: this fake implements the session and path state read by openSessionInWeb.
    expect(
      openSessionInWeb(api as never, bridgeFile, "session-2", "http://localhost:4096/"),
    ).toEqual({ ok: true });
    const payload: OpenWebPayload = JSON.parse(await readFile(bridgeFile, "utf8"));
    expect(payload).toMatchObject({
      action: "open-web",
      sessionId: "session-2",
      directory: "/session-worktree",
      baseUrl: "http://localhost:4096",
    });
  });

  test("returns actionable errors instead of throwing", () => {
    expect(
      writeOpenWebRequest("", {
        v: 1,
        action: "open-web",
        sessionId: "session-3",
        directory: "/worktree",
      }),
    ).toEqual({ ok: false, error: "Forge bridge unavailable (restart terminal from Forge)" });
  });
});

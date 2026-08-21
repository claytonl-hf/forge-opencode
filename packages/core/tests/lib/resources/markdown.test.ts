import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { listAgents } from "#lib/resources/agents";
import { listCommands } from "#lib/resources/commands";

const directories: string[] = [];

async function directory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "forge-markdown-"));
  directories.push(path);
  return path;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true })));
});

describe("Markdown resources", () => {
  test("loads agents by filename and preserves their prompt", async () => {
    const path = await directory();
    await writeFile(
      join(path, "reviewer.md"),
      "---\ndescription: Reviews code\nmode: subagent\ntemperature: 0.2\n---\nReview carefully.\n",
    );

    expect(await listAgents(path)).toEqual({
      reviewer: {
        description: "Reviews code",
        mode: "subagent",
        temperature: 0.2,
        prompt: "Review carefully.\n",
      },
    });
  });

  test("loads commands by filename and preserves their template", async () => {
    const path = await directory();
    await writeFile(
      join(path, "release.md"),
      "---\ndescription: Prepare a release\nagent: build\nsubtask: true\n---\nRelease $ARGUMENTS\n",
    );

    expect(await listCommands(path)).toEqual({
      release: {
        description: "Prepare a release",
        agent: "build",
        subtask: true,
        template: "Release $ARGUMENTS\n",
      },
    });
  });

  test("skips malformed files without dropping valid siblings", async () => {
    const path = await directory();
    await Promise.all([
      writeFile(join(path, "valid.md"), "---\ndescription: Valid\n---\nRun it.\n"),
      writeFile(join(path, "invalid.md"), "---\ndescription: 42\n---\nBroken.\n"),
      writeFile(join(path, "ignored.txt"), "not markdown"),
    ]);

    expect(await listCommands(path)).toEqual({
      valid: { description: "Valid", template: "Run it.\n" },
    });
  });

  test("returns an empty collection for an empty or missing directory", async () => {
    const path = await directory();
    const missing = join(path, "missing");
    await mkdir(join(path, "empty"));

    expect(await listAgents(join(path, "empty"))).toEqual({});
    expect(await listAgents(missing)).toEqual({});
  });
});

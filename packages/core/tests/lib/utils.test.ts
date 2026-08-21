import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { createVersion, exists } from "#lib/utils";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true })));
});

describe("exists", () => {
  test("distinguishes existing and missing paths", async () => {
    const directory = await mkdtemp(join(tmpdir(), "forge-utils-"));
    directories.push(directory);
    const file = join(directory, "file");
    await writeFile(file, "contents");

    expect(await exists(file)).toBe(true);
    expect(await exists(join(directory, "missing"))).toBe(false);
  });
});

describe("createVersion", () => {
  test("returns a version capable of range checks", () => {
    const version = createVersion("0.2.179");

    expect(version?.version).toBe("0.2.179");
    expect(version?.satisfies(">=0.2.179")).toBe(true);
    expect(version?.satisfies(">=1.0.0")).toBe(false);
  });

  test("returns undefined for invalid semver", () => {
    expect(createVersion("not-a-version")).toBeUndefined();
  });
});

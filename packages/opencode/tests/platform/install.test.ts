import { afterEach, describe, expect, test } from "bun:test";
import { parseJSONC } from "confbox";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Profiles } from "../../src/features/profiles/presets";
import { install } from "../../src/platform/install";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("install", () => {
  test("preserves custom profiles while installing the shipped presets", async () => {
    const directory = await mkdtemp(join(tmpdir(), "forge-opencode-install-"));
    directories.push(directory);
    const custom = {
      name: "Custom",
      models: { $default: { id: "custom/model", variant: "medium" } },
    };

    await Promise.all([
      writeFile(join(directory, "opencode.jsonc"), "{}"),
      writeFile(join(directory, "tui.jsonc"), "{}"),
      writeFile(
        join(directory, "forge.jsonc"),
        JSON.stringify({
          profiles: {
            custom,
            pareto: { models: { $default: { id: "stale/model" } } },
          },
        }),
      ),
    ]);

    await install({ location: directory, profiles: true });

    const config: { profiles?: Record<string, (typeof Profiles)[string] | typeof custom> } =
      parseJSONC(await readFile(join(directory, "forge.jsonc"), "utf-8"));
    expect(config.profiles).toEqual({ custom, ...Profiles });
    expect(config.profiles).not.toHaveProperty("opus-luna");
  });
});

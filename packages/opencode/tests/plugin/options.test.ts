import { afterEach, describe, expect, test } from "bun:test";
import { parseJSONC } from "confbox";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ForgeDefaultOptions, ForgeOptions, useForgeOptions } from "../../src/plugin/options";

const directories: string[] = [];

async function projectWithOptions(
  value: Parameters<typeof JSON.stringify>[0],
): Promise<{ project: string; file: string }> {
  const project = await mkdtemp(join(tmpdir(), "forge-opencode-options-"));
  directories.push(project);
  const directory = join(project, ".opencode");
  const file = join(directory, "forge.jsonc");
  await mkdir(directory);
  await writeFile(file, JSON.stringify(value, null, 2));
  return { project, file };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("ForgeOptions", () => {
  test("provides stable defaults", () => {
    expect(ForgeDefaultOptions).toEqual({
      agents: true,
      tui: { theme: true, notify: false, components: true },
    });
  });

  test("normalizes partial TUI component options", () => {
    expect(ForgeOptions.parse({ tui: { components: { logo: false } } })).toEqual({
      agents: true,
      tui: {
        theme: true,
        notify: false,
        components: { logo: false, usage: true, web: true, profile: true, workers: true },
      },
    });
  });

  test("rejects invalid profiles and agent settings", () => {
    expect(() => ForgeOptions.parse({ agents: [1] })).toThrow();
    expect(() => ForgeOptions.parse({ profiles: { broken: { models: {} } } })).not.toThrow();
    expect(() =>
      ForgeOptions.parse({ profiles: { broken: { models: { $default: { id: 42 } } } } }),
    ).toThrow();
  });
});

describe("useForgeOptions", () => {
  test("loads and defaults a local project configuration", async () => {
    const { project } = await projectWithOptions({
      agents: ["reviewer"],
      profile: "balanced",
      profiles: {},
      tui: {
        theme: false,
        notify: true,
        components: { logo: false, usage: true, web: true, profile: true, workers: true },
      },
    });

    expect((await useForgeOptions(project)).value).toMatchObject({
      agents: ["reviewer"],
      profile: "balanced",
      tui: {
        theme: false,
        notify: true,
        components: { logo: false, usage: true, web: true, workers: true },
      },
    });
  });

  test("supports object and callback updates and writes the local file", async () => {
    const { project, file } = await projectWithOptions(ForgeDefaultOptions);
    const options = await useForgeOptions(project);

    const first = await options.update({
      ...options.value,
      agents: false,
      profile: "lite",
    });
    expect(first).toMatchObject({ agents: false, profile: "lite" });
    const persistedFirst: unknown = parseJSONC(await readFile(file, "utf-8"));
    expect(persistedFirst).toEqual(first);

    const second = await options.update((current) => ({ ...current, agents: ["reviewer"] }));
    expect(second.agents).toEqual(["reviewer"]);
    const persistedSecond: unknown = parseJSONC(await readFile(file, "utf-8"));
    expect(persistedSecond).toEqual(second);
  });

  test("rejects invalid updates without overwriting the file", async () => {
    const { project, file } = await projectWithOptions(ForgeDefaultOptions);
    const before = await readFile(file, "utf-8");
    const options = await useForgeOptions(project);

    await expect(
      options.update(() => ForgeOptions.parse({ ...options.value, agents: [1] })),
    ).rejects.toThrow();
    expect(await readFile(file, "utf-8")).toBe(before);
  });
});

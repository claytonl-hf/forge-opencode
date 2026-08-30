import { parseJSONC } from "confbox";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { ForgeDefaultOptions, ForgeOptions, useForgeOptions } from "#plugin/options";

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

    const first = await options.update(
      {
        ...options.value,
        agents: false,
        profile: "lite",
      },
      { persistProfile: true },
    );
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

describe("useForgeOptions with FORGE_PROFILE", () => {
  const previousProfile = process.env.FORGE_PROFILE;

  afterEach(() => {
    if (previousProfile === undefined) delete process.env.FORGE_PROFILE;
    else process.env.FORGE_PROFILE = previousProfile;
  });

  const profiles = {
    configured: { models: { reviewer: { id: "configured-model" } } },
    environment: { models: { reviewer: { id: "environment-model" } } },
  };

  test("applies a valid FORGE_PROFILE to the initial runtime options", async () => {
    process.env.FORGE_PROFILE = "environment";
    const { project } = await projectWithOptions({ profile: "configured", profiles });

    expect((await useForgeOptions(project)).value.profile).toBe("environment");
  });

  test("ignores an unknown or unset FORGE_PROFILE", async () => {
    const { project } = await projectWithOptions({ profile: "configured", profiles });

    delete process.env.FORGE_PROFILE;
    expect((await useForgeOptions(project)).value.profile).toBe("configured");

    process.env.FORGE_PROFILE = "missing";
    expect((await useForgeOptions(project)).value.profile).toBe("configured");
  });

  test("preserves file-configured agents and tui when the profile override applies", async () => {
    process.env.FORGE_PROFILE = "environment";
    const { project } = await projectWithOptions({
      agents: ["reviewer"],
      profile: "configured",
      profiles,
      tui: { theme: false, notify: true },
    });

    const { value } = await useForgeOptions(project);
    expect(value.profile).toBe("environment");
    expect(value.agents).toEqual(["reviewer"]);
    expect(value.tui).toEqual({ theme: false, notify: true, components: true });
  });

  test("does not persist the environment profile on unrelated updates", async () => {
    process.env.FORGE_PROFILE = "environment";
    const { project, file } = await projectWithOptions({ profile: "configured", profiles });
    const options = await useForgeOptions(project);
    expect(options.value.profile).toBe("environment");

    await options.update((current) => ({ ...structuredClone(current), agents: false }));

    const persisted: unknown = parseJSONC(await readFile(file, "utf-8"));
    expect(persisted).toMatchObject({ profile: "configured" });
    expect(options.value.profile).toBe("environment");
  });

  test("persists an explicitly selected global profile", async () => {
    process.env.FORGE_PROFILE = "environment";
    const { project, file } = await projectWithOptions({
      profile: "configured",
      profiles: { ...profiles, balanced: { models: { reviewer: { id: "balanced-model" } } } },
    });
    const options = await useForgeOptions(project);

    const next = await options.update(
      (current) => {
        const updated = structuredClone(current);
        updated.profile = "balanced";
        return updated;
      },
      { persistProfile: true },
    );
    expect(next.profile).toBe("balanced");

    const persisted: unknown = parseJSONC(await readFile(file, "utf-8"));
    expect(persisted).toMatchObject({ profile: "balanced" });
  });

  test("persists the environment-seeded profile when explicitly requested", async () => {
    process.env.FORGE_PROFILE = "environment";
    const { project, file } = await projectWithOptions({ profile: "configured", profiles });
    const options = await useForgeOptions(project);
    expect(options.value.profile).toBe("environment");
    const runtime = options.value;

    const next = await options.update(
      (current) => ({ ...structuredClone(current), agents: false }),
      { persistProfile: true },
    );
    expect(next.profile).toBe("environment");
    expect(options.value).toBe(runtime);

    const persisted: unknown = parseJSONC(await readFile(file, "utf-8"));
    expect(persisted).toMatchObject({ profile: "environment" });
  });

  test("removes an explicitly cleared profile from disk and runtime", async () => {
    process.env.FORGE_PROFILE = "environment";
    const { project, file } = await projectWithOptions({ profile: "configured", profiles });
    const options = await useForgeOptions(project);

    const next = await options.update(
      (current) => {
        const updated = structuredClone(current);
        delete updated.profile;
        return updated;
      },
      { persistProfile: true },
    );
    expect(next.profile).toBeUndefined();
    expect(options.value).not.toHaveProperty("profile");

    const persisted: unknown = parseJSONC(await readFile(file, "utf-8"));
    expect(persisted).not.toHaveProperty("profile");

    await options.update((current) => ({ ...structuredClone(current), agents: false }));
    const repersisted: unknown = parseJSONC(await readFile(file, "utf-8"));
    expect(repersisted).not.toHaveProperty("profile");
    expect(options.value).not.toHaveProperty("profile");
  });

  test("does not re-read FORGE_PROFILE after initialization", async () => {
    process.env.FORGE_PROFILE = "environment";
    const { project } = await projectWithOptions({ profile: "configured", profiles });
    const options = await useForgeOptions(project);

    process.env.FORGE_PROFILE = "configured";
    expect(options.value.profile).toBe("environment");

    const next = await options.update((current) => ({
      ...structuredClone(current),
      agents: false,
    }));
    expect(next.profile).toBe("environment");
  });
});

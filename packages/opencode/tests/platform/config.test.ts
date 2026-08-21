import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  configureAgents,
  configurePlugins,
  patch,
  resolve,
  update,
} from "../../src/platform/config";

const directories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "forge-opencode-config-"));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("configureAgents", () => {
  test("merges agents in priority order", () => {
    expect(
      configureAgents(
        { reviewer: { description: "Forge", model: "forge/default", variant: "low" } },
        { reviewer: { description: "User", temperature: 0.2 } },
      ),
    ).toEqual({
      reviewer: {
        description: "User",
        model: "forge/default",
        variant: "low",
        temperature: 0.2,
      },
    });
  });

  test("uses null to remove properties and ignores undefined", () => {
    expect(
      configureAgents(
        { reviewer: { model: "forge/default", variant: "high" } },
        { reviewer: { model: undefined, variant: null } },
      ),
    ).toEqual({ reviewer: { model: "forge/default" } });
  });
});

describe("configurePlugins", () => {
  test("merges options and upgrades versions without duplicating plugins", () => {
    expect(
      configurePlugins(["plain", ["package@1.0.0", { existing: true }], "@scope/plugin@1.2.3"], {
        "package@2.0.0": { added: true },
        "@scope/plugin": { enabled: true },
        newPlugin: {},
      }),
    ).toEqual([
      "plain",
      ["package@2.0.0", { existing: true, added: true }],
      ["@scope/plugin@1.2.3", { enabled: true }],
      "newPlugin",
    ]);
  });

  test("removes disabled plugins while preserving local identifiers", () => {
    expect(
      configurePlugins(
        ["package@1.0.0", "./plugin.ts", "/absolute/plugin.ts", "file:///plugin.ts"],
        { package: false, "./plugin.ts": { local: true } },
      ),
    ).toEqual([["./plugin.ts", { local: true }], "/absolute/plugin.ts", "file:///plugin.ts"]);
  });
});

describe("resolve", () => {
  test("prefers JSONC over JSON", async () => {
    const directory = await temporaryDirectory();
    await Promise.all([
      writeFile(join(directory, "opencode.jsonc"), "{}"),
      writeFile(join(directory, "opencode.json"), "{}"),
    ]);

    expect((await resolve(directory, "opencode"))?.path).toBe(join(directory, "opencode.jsonc"));
  });

  test("returns null when missing or proposes JSONC when creation is enabled", async () => {
    const directory = await temporaryDirectory();

    expect(await resolve(directory, "forge")).toBeNull();
    expect(await resolve(directory, "forge", true)).toMatchObject({
      path: join(directory, "forge.jsonc"),
      parse: null,
    });
  });
});

describe("update", () => {
  test("passes a clone to the updater and reports structural changes", async () => {
    const input = { nested: { value: 1 } };
    const result = await update(input, (config) => {
      config.nested.value = 2;
      return config;
    });

    expect(input).toEqual({ nested: { value: 1 } });
    expect(result.output).toEqual({ nested: { value: 2 } });
    expect(result.changes).toHaveLength(1);
  });
});

describe("patch", () => {
  test("parses and updates JSONC", async () => {
    const directory = await temporaryDirectory();
    const file = join(directory, "opencode.jsonc");
    await writeFile(file, '{\n  // retained\n  "enabled": true,\n}\n');

    const result = await patch(directory, "opencode", (config) => ({
      ...config,
      model: "forge/model",
    }));
    const contents = await readFile(file, "utf-8");

    expect(result.path).toBe(file);
    expect(result.changes.length).toBeGreaterThan(0);
    expect(contents).toContain('"enabled": true');
    expect(contents).toContain('"model": "forge/model"');
  });

  test("does not rewrite a file when the updater makes no changes", async () => {
    const directory = await temporaryDirectory();
    const file = join(directory, "opencode.jsonc");
    const contents = '{\n  // exact formatting\n  "enabled": true,\n}\n';
    await writeFile(file, contents);

    const result = await patch(directory, "opencode", (config) => config);

    expect(result.changes).toEqual([]);
    expect(await readFile(file, "utf-8")).toBe(contents);
  });

  test("creates a missing configuration when requested", async () => {
    const directory = await temporaryDirectory();
    await mkdir(directory, { recursive: true });

    const result = await patch(directory, "forge", () => ({ agents: false }), true);

    expect(result.path).toBe(join(directory, "forge.jsonc"));
    expect(await readFile(result.path, "utf-8")).toContain('"agents": false');
  });

  test("fails clearly when configuration is missing", async () => {
    const directory = await temporaryDirectory();

    await expect(patch(directory, "opencode", (config) => config)).rejects.toThrow(
      `Configuration file not found: ${directory}/opencode`,
    );
  });
});

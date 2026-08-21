import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { BrandIntegration } from "#features/brand/integration";
import { ForgeOptions } from "#plugin/options";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

async function forge() {
  const themes = await mkdtemp(join(tmpdir(), "forge-brand-"));
  temporaryDirectories.push(themes);
  await writeFile(join(themes, "forge.json"), "{}");
  return {
    themes,
    opencode: vi.fn(async () => ({ directories: { themes } })),
  };
}

describe("brand integration", () => {
  test("owns Forge theme installation and the home logo", async () => {
    const instance = await forge();
    const install = vi.fn(async () => true);
    const set = vi.fn(async () => true);
    const options = { value: ForgeOptions.parse({}) };
    // SAFETY: BrandIntegration only calls forge.opencode and reads options.value during setup.
    const integration = await BrandIntegration(instance as never, options as never);
    // SAFETY: this focused API fake provides the theme operations exercised by brand setup.
    const contribution = await integration.tui!({ theme: { install, set } } as never);

    expect(install).toHaveBeenCalledWith(join(instance.themes, "forge.json"));
    expect(set).toHaveBeenCalledWith("forge");
    expect(contribution.slots?.home_logo).toBeTypeOf("function");
  });

  test("can disable theme and logo independently", async () => {
    const instance = await forge();
    const install = vi.fn(async () => true);
    const options = {
      value: ForgeOptions.parse({ tui: { theme: false, components: { logo: false } } }),
    };
    // SAFETY: BrandIntegration only calls forge.opencode and reads options.value during setup.
    const integration = await BrandIntegration(instance as never, options as never);
    // SAFETY: disabled setup does not call the omitted theme.set operation.
    const contribution = await integration.tui!({ theme: { install } } as never);

    expect(install).not.toHaveBeenCalled();
    expect(contribution.slots).toEqual({});
  });
});

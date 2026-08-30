import { defu } from "defu";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import { Profile } from "#features/profiles/profile";
import { ConfigDirectories, resolve } from "#platform/config";

const ForgeTuiComponents = z
  .object({
    logo: z.boolean().optional().default(true).describe("Forge logo in home screen"),
    usage: z.boolean().optional().default(true).describe("Forge usage balance"),
    web: z.boolean().optional().default(true).describe("Open in Forge action"),
    profile: z
      .boolean()
      .optional()
      .default(true)
      .describe("Current Forge profile name on the session prompt"),
    workers: z.boolean().optional().describe("Workers in the session sidebar"),
  })
  .transform(({ workers, ...components }) => ({
    ...components,
    workers: workers ?? true,
  }));

const ForgeTui = z.object({
  theme: z.boolean().optional().default(true).describe("Toggle Forge TUI theme"),
  notify: z.boolean().optional().default(false).describe("Notify Forge when sessions become idle"),
  components: z
    .union([z.boolean(), ForgeTuiComponents])
    .optional()
    .default(true)
    .describe("Show or hide Forge TUI components"),
});

export const ForgeOptions = z.object({
  agents: z
    .union([z.boolean(), z.array(z.string())])
    .optional()
    .default(true)
    .describe("Enable, disable, or specify Forge agents to use"),
  profile: z.string().optional().describe("Forge model profile to use"),
  profiles: z.record(z.string(), Profile).optional().describe("Forge model profiles"),
  tui: ForgeTui.optional().default(ForgeTui.parse({})).describe("Forge TUI options"),
});

export type ForgeOptions = z.infer<typeof ForgeOptions>;
type ForgeOptionsUpdater = (
  options: ForgeOptions | ((options: ForgeOptions) => ForgeOptions),
  intent?: { persistProfile?: boolean },
) => Promise<ForgeOptions> | ForgeOptions;

export const ForgeDefaultOptions = ForgeOptions.parse({});

export async function useForgeOptions(directory: string = process.cwd()) {
  const files = await Promise.all([
    resolve(join(directory, ConfigDirectories.local), "forge"),
    resolve(ConfigDirectories.global, "forge"),
  ]).then((files) => files.filter((file): file is NonNullable<typeof file> => file !== null));
  const configs = await Promise.all(
    files.map(async (file) => {
      try {
        const value = file.parse ? file.parse(await readFile(file.path, "utf-8")) : {};

        return ForgeOptions.parse(value);
      } catch {
        // Do not block on invalid config files, just ignore them
        return null;
      }
    }),
  ).then((results) =>
    results.filter((result): result is NonNullable<typeof result> => result !== null),
  );

  // Merge and validate file configuration before applying the runtime override.
  const [firstConfig, ...remainingConfigs] = configs;
  const configured: ForgeOptions = firstConfig
    ? defu(firstConfig, ...remainingConfigs, ForgeDefaultOptions)
    : ForgeDefaultOptions;

  // FORGE_PROFILE is consumed exactly once, while Forge options are being resolved.
  // An unknown value is ignored, and the override only applies to the in-memory
  // runtime options: persisting a profile requires an explicit
  // `{ persistProfile: true }` intent on the update.
  const envProfile = process.env.FORGE_PROFILE;
  const runtimeProfile =
    envProfile && configured.profiles?.[envProfile] ? envProfile : configured.profile;
  const value: ForgeOptions = { ...configured, profile: runtimeProfile };
  let persistedProfile = configured.profile;

  const update: ForgeOptionsUpdater = async (updater, intent) => {
    const next = updater instanceof Function ? updater(value) : updater;
    const data = ForgeOptions.parse(next);

    // Only an explicit persistence intent writes the profile choice; unrelated
    // updates keep the configured profile on disk so the env seed cannot leak.
    const persisted = intent?.persistProfile ? data : { ...data, profile: persistedProfile };

    for (const file of files) {
      await writeFile(file.path, file.stringify(persisted), "utf-8");
      break;
    }

    persistedProfile = persisted.profile;

    // Keep the exposed runtime object exactly in step with the applied update
    // without replacing its identity, since consumers hold `options.value`.
    // SAFETY: value is a ForgeOptions, so its runtime keys are valid ForgeOptions keys.
    for (const key of Object.keys(value) as (keyof ForgeOptions)[]) {
      if (!(key in data)) delete value[key];
    }
    Object.assign(value, data);

    return data;
  };

  return { value, update };
}

export type UseForgeOptions = Awaited<ReturnType<typeof useForgeOptions>>;

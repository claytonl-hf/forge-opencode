import { defu } from "defu";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import { Profile } from "../features/profiles/profile";
import { ConfigDirectories, resolve } from "../platform/config";

const ForgeTuiComponents = z
  .object({
    logo: z.boolean().optional().default(true).describe("Forge logo in home screen"),
    usage: z.boolean().optional().default(true).describe("Forge usage balance"),
    web: z.boolean().optional().default(true).describe("Open in Forge action"),
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

  const [firstConfig, ...remainingConfigs] = configs;
  const value: ForgeOptions = firstConfig
    ? defu(firstConfig, ...remainingConfigs, ForgeDefaultOptions)
    : ForgeDefaultOptions;

  const update: ForgeOptionsUpdater = async (updater) => {
    const next = updater instanceof Function ? updater(value) : updater;
    const data = ForgeOptions.parse(next);

    for (const file of files) {
      await writeFile(file.path, file.stringify(data), "utf-8");
      break;
    }
    return data;
  };

  return { value, update };
}

export type UseForgeOptions = Awaited<ReturnType<typeof useForgeOptions>>;

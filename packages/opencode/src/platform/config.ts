import type { Config as BaseConfig, PluginOptions } from "@opencode-ai/plugin";

import { exists } from "@forge/core/utils";
import { parseJSONC, parseJSON, stringifyJSON, stringifyJSONC } from "confbox";
import diff from "microdiff";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const PackageRoot = fileURLToPath(new URL("../../", import.meta.url));

export const ConfigDirectories = {
  global: process.env.OPENCODE_CONFIG_DIRECTORY || join(homedir(), ".config", "opencode"),
  local: ".opencode",
};

type PermissionAction = "ask" | "allow" | "deny";
type PermissionRule = PermissionAction | Record<string, PermissionAction>;

export type Config = Omit<BaseConfig, "permission"> & {
  default_agent?: string;
  permission?: Record<string, PermissionRule>;
  skills?: {
    paths?: string[];
  };
};

type ValueOf<T> = NonNullable<T[keyof T]>;
export type ConfigAgent = ValueOf<NonNullable<Config["agent"]>>;
export type ConfigProvider = ValueOf<NonNullable<Config["provider"]>>;
export type ConfigModel = ValueOf<NonNullable<ConfigProvider["models"]>>;
export type ConfigPlugin = Array<string | [string, PluginOptions]>;

/**
 * Merges multiple agent configurations into a single configuration.
 * If a property is set to `null`, it will be removed from the final configuration.
 * If a property is set to `undefined`, it will be ignored and the existing value will be kept.
 */
export function configureAgents(
  ...inputs: Array<
    Record<
      string,
      {
        [K in keyof ConfigAgent]?: ConfigAgent[K] | null;
      }
    >
  >
) {
  const agents: Record<string, ConfigAgent> = {};

  for (const input of inputs) {
    for (const [name, patch] of Object.entries(input)) {
      // SAFETY: an empty agent is valid while successive configuration patches populate it.
      const agent = (agents[name] ??= {} as ConfigAgent);

      // SAFETY: Object.keys erases keys from the typed partial ConfigAgent patch.
      for (const key of Object.keys(patch) as Array<keyof ConfigAgent>) {
        const value = patch[key];

        if (value === null) {
          delete agent[key];
        } else if (value !== undefined) {
          agent[key] = value;
        }
      }
    }
  }

  return agents;
}

/**
 * Merges a source plugin configuration with an override configuration.
 * If a plugin is set to `false` in the override, it will be removed from the final configuration.
 * If a plugin is set to an object in the override, its options will be merged with
 * the corresponding plugin configuration in the source.
 */
export function configurePlugins(
  source: ConfigPlugin,
  override: Record<string, PluginOptions | false> = {},
): ConfigPlugin {
  const definePlugin = (plugin: ConfigPlugin[number]) => {
    const id = Array.isArray(plugin) ? plugin[0] : plugin;
    const isLocal = [".", "/", "file://"].some((prefix) => id.startsWith(prefix));
    const options: PluginOptions = Array.isArray(plugin) ? plugin[1] : {};

    if (!isLocal) {
      const pattern = /^((?:@[^/@]+\/)?[^@]+)(?:@(.+))?$/;
      const [name, version] = pattern.exec(id)?.slice(1) ?? [];

      if (name) return { name, version, options };
    }

    return { name: id, version: undefined, options };
  };

  type Plugins = Map<string, { version?: string; options?: PluginOptions | false }>;
  const plugins: Plugins = new Map(
    source.map((plugin) => {
      const { name, version, options } = definePlugin(plugin);
      return [name, { version, options }];
    }),
  );
  const overrides: Plugins = new Map(
    Object.entries(override).map(([plugin, options]) => {
      const { name, version } = definePlugin(plugin);
      return [name, { version, options }];
    }),
  );

  for (const [name, { version, options }] of plugins) {
    if (overrides.has(name)) {
      const override = overrides.get(name)!;

      if (override.options === false) {
        plugins.delete(name);
      } else {
        plugins.set(name, {
          version: override.version ?? version,
          options: {
            ...options,
            ...override.options,
          },
        });
      }

      overrides.delete(name);
    }
  }

  for (const [name, { version, options }] of overrides) {
    if (options === false) continue;
    plugins.set(name, { version, options });
  }

  return Array.from(plugins).map(([name, { version, options }]) => {
    const id = version ? `${name}@${version}` : name;
    return options && Object.keys(options).length > 0 ? [id, options] : id;
  });
}

/**
 * Resolves a configuration file by checking for the existence
 * of JSONC and JSON files in the specified directory.
 */
export async function resolve(directory: string, name: string, create: boolean = false) {
  const extensions = {
    jsonc: [parseJSONC, stringifyJSONC],
    json: [parseJSON, stringifyJSON],
  } as const;

  for (const [ext, [parse, stringify]] of Object.entries(extensions)) {
    const path = `${directory}/${name}.${ext}`;
    if (await exists(path)) {
      return { path, parse, stringify };
    }
  }

  if (create) {
    const [ext, [_, stringify]] = Object.entries(extensions)[0]!;
    const path = `${directory}/${name}.${ext}`;
    return { path, parse: null, stringify };
  }

  return null;
}

/**
 * Updates a configuration object using a provided updater function.
 * The updater function receives a deep clone of the source configuration
 * and should return the updated configuration. The function returns an object
 * containing the updated configuration and a list of changes made.
 */
export async function update<T extends object = Config>(
  input: T,
  updater: (config: T) => Promise<T> | T,
) {
  const output = await updater(structuredClone(input));
  const changes = diff(input, output);

  return { output, changes };
}

/**
 * Patches a configuration file in the specified directory using a provided updater function.
 * The updater function receives the current configuration and should return the updated configuration.
 * If changes are made, the updated configuration is written back to the file.
 * The function returns an object containing the updated configuration and a list of changes made.
 */
export async function patch<T extends object = Config>(
  directory: string,
  filename: string,
  updater: (config: T) => Promise<T> | T,
  create: boolean = false,
) {
  const config = await resolve(directory, filename, create);

  if (!config) {
    throw new Error(`Configuration file not found: ${directory}/${filename}`);
  }

  // SAFETY: the configured parser owns T; a newly created configuration starts as an empty T.
  const input = config.parse ? config.parse(await readFile(config.path, "utf-8")) : ({} as T);
  // SAFETY: parsed configuration is the T selected by this typed patch operation.
  const { output, changes } = await update(input as T, updater);

  if (changes.length > 0) {
    await writeFile(config.path, config.stringify(output), "utf-8");
  }

  return { path: config.path, output, changes };
}

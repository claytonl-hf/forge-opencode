import { dirname, join } from "node:path";

import { ForgeNotReady, ForgeError } from "./errors";
import { getModels } from "./models";
import { listAgents } from "./resources/agents";
import { listCommands } from "./resources/commands";
import { getUsage } from "./resources/usage";
import { store, Store } from "./store";
import {
  ForgeStatus,
  ForgeEnvironment,
  ForgeOpenCode,
  ForgeCatalog,
  type ForgeModels,
  type ForgeProvider,
} from "./types";
import { exists } from "./utils";

export const ForgeMinimumVersion = "0.2.179";

export class Forge {
  private environment?: ForgeEnvironment;

  constructor(
    public readonly path: string,
    public readonly uri: string,
    public readonly token: string,
  ) {}

  get directory() {
    return dirname(this.path);
  }

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${this.token}`);

    const response = await fetch(`${this.uri}${path}`, {
      ...options,
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      throw new ForgeNotReady(
        `Forge is not reachable. Request to ${path} failed with status ${response.status} ${response.statusText}.`,
      );
    }

    // SAFETY: callers select T for this untyped transport method and owning methods parse responses.
    return response.json() as Promise<T>;
  }

  async ping() {
    const response = await this.request("/v1/ping");
    const { success, data, error } = ForgeStatus.safeParse(response);

    if (!success) {
      throw new ForgeError(`Forge ping response is malformed. ${error?.message}`);
    }

    return data;
  }

  async env(fresh = false) {
    if (!this.environment && !fresh) {
      this.environment = await store.get(Store.Environment);
    }

    if (!this.environment || fresh) {
      const response = await this.request("/v1/env");
      const { success, data, error } = ForgeEnvironment.safeParse(response);

      if (!success) {
        throw new ForgeError(`Forge environment is malformed. ${error?.message}`);
      }

      this.environment = data;
      await store.set(Store.Environment, this.environment);
    }

    return this.environment;
  }

  async opencode() {
    const { env, opencodeBin } = await this.env();
    const bootstrap =
      env?.FORGE_TERMINAL_BOOTSTRAP_DIR || join(this.directory, "terminal-bootstrap");
    const oc = ForgeOpenCode.parse({
      bin: opencodeBin,
      directories: {
        agents: join(bootstrap, "opencode-agents"),
        commands: join(bootstrap, "opencode-commands"),
        themes: join(bootstrap, "opencode-themes"),
        plugins: join(bootstrap, "opencode-plugins"),
      },
      permissions: JSON.parse(env.FORGE_OPENCODE_WRITE_PERMISSIONS_JSON),
      bridge: {
        notifier: env.FORGE_OPENCODE_DONE_NOTIFIER_FILE,
        web: {
          file: env.FORGE_OPENCODE_WEB_BRIDGE_FILE,
          url: env.FORGE_OPENCODE_ATTACH_URL,
        },
      },
    });

    for (const [key, value] of Object.entries(oc.directories)) {
      if (!(await exists(value))) {
        throw new ForgeNotReady(`Forge OpenCode directory ${key} is not accessible at ${value}.`);
      }
    }

    return oc;
  }

  async catalog() {
    try {
      const { env } = await this.env();
      const { success, data, error } = ForgeCatalog.safeParse(
        JSON.parse(env.FORGE_OPENCODE_MODEL_CATALOG_JSON),
      );

      if (!success) {
        throw new ForgeError(`Forge catalog is malformed. ${error?.message}`);
      }

      return data;
    } catch {
      return undefined;
    }
  }

  async models(): Promise<ForgeModels> {
    const catalog = await this.catalog();

    return await getModels(
      (catalog?.models ?? []).map((model) => ({
        id: model.id,
        name: model.name,
        limit: model.limit,
      })),
    );
  }

  async agents() {
    const [catalog, opencode] = await Promise.all([this.catalog(), this.opencode()]);
    const agents = await listAgents(opencode.directories.agents);
    const provider = await this.provider();

    await Promise.all(
      Object.entries(agents).map(async ([name, agent]) => {
        const options = (catalog?.agents ?? []).find((agent) => agent.role === name);

        agents[name] = {
          ...agent,
          name,
          model: options?.model ? `${provider!.id}/${options.model}` : undefined,
          variant: options?.reasoningEffort,
        };
      }),
    );

    return agents;
  }

  async provider(): Promise<ForgeProvider | undefined> {
    try {
      const { env } = await this.env();
      const models = await this.models();

      if (Object.keys(models).length === 0) {
        throw new ForgeNotReady(`No models available in the Forge catalog.`);
      }

      return {
        id: "forge",
        name: "Forge",
        package: "@openrouter/ai-sdk-provider",
        api: {
          endpoint: env.FORGE_OPENROUTER_BROKER_BASE_URL,
          key: env.FORGE_SUPABASE_ACCESS_TOKEN,
          headers: {
            "HTTP-Referer": "https://forge.humanforce.com",
            "X-Title": "Forge OpenCode",
          },
        },
        models,
      };
    } catch {
      return undefined;
    }
  }

  async usage() {
    const { env } = await this.env();
    const file = env.FORGE_USAGE_SNAPSHOT_FILE;

    return file ? await getUsage(file) : undefined;
  }

  async commands() {
    const opencode = await this.opencode();
    const commands = await listCommands(opencode.directories.commands);

    return commands;
  }

  async mcp() {
    try {
      const { env } = await this.env();

      return {
        type: "remote" as const,
        url: env.FORGE_MCP_URL,
        headers: {
          Authorization: `Bearer ${env.FORGE_MCP_TOKEN}`,
        },
      };
    } catch {
      return undefined;
    }
  }
}

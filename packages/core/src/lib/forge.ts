import { dirname, join } from "node:path";

import { client } from "./api/client";
import { EnvResponseSchema, type ForgeEnvironment } from "./api/env";
import { getModels, ModelsResponseSchema, type ForgeModels } from "./api/models";
import { PingResponseSchema, type ForgeStatus } from "./api/ping";
import { ForgeNotReady } from "./errors";
import { listAgents } from "./resources/agents";
import { listCommands } from "./resources/commands";
import { getUsage } from "./resources/usage";
import { store, Store } from "./store";
import { ForgeOpenCode, type ForgeProvider } from "./types";
import { exists } from "./utils";

export const ForgeMinimumVersion = "0.2.189";

export class Forge {
  private environment?: ForgeEnvironment;
  private readonly request: ReturnType<typeof client>;

  constructor(
    public readonly path: string,
    public readonly uri: string,
    public readonly token: string,
  ) {
    this.request = client(uri, token);
  }

  get directory() {
    return dirname(this.path);
  }

  get api() {
    return {
      request: this.request,
      env: () => this.request("/v1/env", { schema: EnvResponseSchema }),
      models: () => this.request("/v1/models", { schema: ModelsResponseSchema }),
      ping: () => this.request("/v1/ping", { schema: PingResponseSchema }),
    };
  }

  async status(): Promise<ForgeStatus> {
    return await this.api.ping();
  }

  async state(fresh = false): Promise<ForgeEnvironment> {
    if (!this.environment && !fresh) {
      this.environment = await store.get(Store.Environment);
    }

    if (!this.environment || fresh) {
      this.environment = await this.api.env();
      await store.set(Store.Environment, this.environment);
    }

    return this.environment;
  }

  async opencode() {
    const { env, opencodeBin } = await this.state();
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

  async models(): Promise<ForgeModels> {
    const catalog = await this.api.models();
    const models = await getModels(catalog.opencode.models);

    return models;
  }

  async agents() {
    const [models, opencode] = await Promise.all([this.api.models(), this.opencode()]);
    const agents = await listAgents(opencode.directories.agents);
    const provider = await this.provider();

    for (const [name, agent] of Object.entries(agents)) {
      const options = (models?.opencode?.agents ?? []).find((agent) => agent.role === name);

      agents[name] = {
        ...agent,
        name,
        model: options?.model ? `${provider!.id}/${options.model}` : undefined,
        variant: options?.reasoningEffort?.toString(),
      };
    }

    return agents;
  }

  async provider(): Promise<ForgeProvider | undefined> {
    try {
      const { env } = await this.state();
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
    const { env } = await this.state();
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
      const { env } = await this.state();

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

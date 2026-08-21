import { dirname } from "node:path";

import { client } from "./api/client";
import { EnvResponseSchema, type ForgeEnvironment } from "./api/env";
import { ModelsResponseSchema } from "./api/models";
import { PingResponseSchema, type ForgeStatus } from "./api/ping";
import { listAgents } from "./resources/agents";
import { listCommands } from "./resources/commands";
import { getModelsFromCatalog } from "./resources/models";
import { createOpenCode } from "./resources/opencode";
import { createProvider } from "./resources/provider";
import { getUsage } from "./resources/usage";
import { store, Store } from "./store";

export const ForgeMinimumVersion = "0.2.192";

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

    return createOpenCode(opencodeBin, env);
  }

  async models() {
    const { env } = await this.state();

    return getModelsFromCatalog(JSON.parse(env.FORGE_OPENCODE_MODEL_CATALOG_JSON));
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
        model: options?.model ? `${provider.id}/${options.model}` : undefined,
        variant: options?.reasoningEffort?.toString(),
      };
    }

    return agents;
  }

  async provider() {
    const { env } = await this.state();

    return createProvider(env);
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

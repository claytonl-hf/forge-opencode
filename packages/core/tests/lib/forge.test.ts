import type { ForgeEnvironment } from "@forge/core";

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer, type IncomingHttpHeaders } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

import { ForgeNotReady } from "../../src/lib/errors";
import { Forge } from "../../src/lib/forge";
import { Store, store } from "../../src/lib/store";

type RouteResponse = { body: unknown; status?: number };
type Route =
  | { response: RouteResponse }
  | { handler: () => RouteResponse | Promise<RouteResponse> };

const routes = new Map<string, Route>();
const requestCounts = new Map<string, number>();
const directories: string[] = [];
let server: ReturnType<typeof createServer>;
let uri = "";
let lastRequest:
  | {
      method: string | undefined;
      url: string | undefined;
      headers: IncomingHttpHeaders;
      body: string;
    }
  | undefined;

function setRoute(path: string, response: Route): void {
  routes.set(path, response);
}

function environment(overrides: Partial<ForgeEnvironment["env"]> = {}): ForgeEnvironment {
  return {
    signedIn: true,
    opencodeBin: "/usr/local/bin/opencode",
    env: {
      FORGE_MCP_URL: "http://127.0.0.1:4312/mcp",
      FORGE_MCP_TOKEN: "mcp-token",
      FORGE_OPENROUTER_BROKER_BASE_URL: "http://127.0.0.1:4312/openrouter",
      FORGE_SUPABASE_ACCESS_TOKEN: "access-token",
      FORGE_OPENCODE_MODEL_CATALOG_JSON: JSON.stringify({
        source: "forge",
        defaultModelId: "openai/gpt-5.6-luna",
        models: [],
        agents: [],
      }),
      FORGE_TERMINAL_BOOTSTRAP_DIR: "/tmp/bootstrap",
      FORGE_OPENCODE_WRITE_PERMISSIONS_JSON: JSON.stringify(["edit", "write"]),
      FORGE_OPENCODE_WEB_BRIDGE_FILE: "/tmp/web-bridge",
      FORGE_OPENCODE_DONE_NOTIFIER_FILE: "/tmp/notifier",
      ...overrides,
    },
  };
}

function model() {
  return {
    id: "openai/gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    isDefault: true,
    limit: { context: 128_000, output: 8_192 },
    group: "openai",
    visionCapable: false,
    intelligence: 5,
    speedTier: "fast",
    tokensPerSec: 100,
    costTier: "low",
    band: "$",
    costInput: 1,
    costOutput: 2,
    contextLimit: 128_000,
    outputLimit: 8_192,
    tags: [],
    capabilities: ["text"],
    reasoningModes: ["none", "low", "medium", "high", "xhigh", "max"],
    reasoningDefault: "high",
  };
}

function modelsResponse() {
  return {
    source: "forge",
    localModelsMerged: true,
    reasoningEfforts: ["high"],
    opencode: {
      defaultModelId: "openai/gpt-5.6-luna",
      models: [model()],
      agents: [{ role: "reviewer", model: "openai/gpt-5.6-luna", reasoningEffort: "high" }],
    },
    budget: {
      exhausted: false,
      spentUsd: 0,
      dailyBudgetUsd: 100,
      remainingUsd: 100,
      enforced: true,
    },
  };
}

function forge(): Forge {
  return new Forge("/Applications/Forge.app/Contents/MacOS/Forge", uri, "token");
}

beforeAll(async () => {
  server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.from(chunk));
    }

    const path = request.url ?? "/";
    requestCounts.set(path, (requestCounts.get(path) ?? 0) + 1);
    lastRequest = {
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: Buffer.concat(chunks).toString("utf8"),
    };

    const configured = routes.get(path);
    const route = configured
      ? "response" in configured
        ? configured.response
        : await configured.handler()
      : { status: 404, body: { error: "not found" } };

    response.statusCode = route.status ?? 200;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(route.body));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  const result = z.object({ port: z.number() }).safeParse(address);
  if (!result.success) {
    throw new Error("Test server did not expose a TCP address.");
  }

  uri = `http://127.0.0.1:${result.data.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

afterEach(async () => {
  routes.clear();
  requestCounts.clear();
  lastRequest = undefined;
  await store.clear(Store.Environment);
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true })));
});

describe("Forge.api.request", () => {
  test("sends authenticated requests while preserving options and caller headers", async () => {
    setRoute("/v1/value", { response: { body: { value: 42 } } });

    const result = await forge().api.request<{ value: number }>("/v1/value", {
      method: "POST",
      headers: { "X-Request-ID": "request-1", Authorization: "Bearer wrong-token" },
      body: "payload",
    });

    expect(result).toEqual({ value: 42 });
    expect(lastRequest).toMatchObject({
      method: "POST",
      url: "/v1/value",
      body: "payload",
    });
    expect(lastRequest?.headers.authorization).toBe("Bearer token");
    expect(lastRequest?.headers["x-request-id"]).toBe("request-1");
  });

  test("turns a non-success response into ForgeNotReady", async () => {
    setRoute("/v1/ping", { response: { status: 503, body: "unavailable" } });

    await expect(forge().api.request("/v1/ping")).rejects.toEqual(
      expect.objectContaining({
        name: "ForgeNotReady",
        message:
          "Forge is not reachable. Request to /v1/ping failed with status 503 Service Unavailable.",
      }),
    );
  });
});

describe("Forge response validation", () => {
  test("status accepts a valid response", async () => {
    setRoute("/v1/ping", {
      response: { body: { ok: true, signedIn: true, version: "0.2.189" } },
    });

    expect(await forge().status()).toEqual({ ok: true, signedIn: true, version: "0.2.189" });
  });

  test("status rejects a malformed response", async () => {
    setRoute("/v1/ping", { response: { body: { ok: "yes", version: 1 } } });

    await expect(forge().status()).rejects.toBeInstanceOf(ForgeNotReady);
    await expect(forge().status()).rejects.toThrow("Forge response for /v1/ping is malformed.");
  });

  test("api.models parses valid data and rejects invalid data", async () => {
    setRoute("/v1/models", { response: { body: modelsResponse() } });

    expect(await forge().api.models()).toMatchObject({
      source: "forge",
      opencode: { defaultModelId: "openai/gpt-5.6-luna" },
    });

    setRoute("/v1/models", { response: { body: { source: 42 } } });
    await expect(forge().api.models()).rejects.toBeInstanceOf(ForgeNotReady);
  });

  test("mcp exposes the configured endpoint without leaking errors", async () => {
    setRoute("/v1/env", { response: { body: environment() } });
    expect(await forge().mcp()).toEqual({
      type: "remote",
      url: "http://127.0.0.1:4312/mcp",
      headers: { Authorization: "Bearer mcp-token" },
    });

    await store.clear(Store.Environment);
    setRoute("/v1/env", { response: { status: 503, body: "unavailable" } });
    expect(await forge().mcp()).toBeUndefined();
  });
});

describe("Forge.state", () => {
  test("hydrates from persistent storage and then uses its in-memory cache", async () => {
    const cached = environment({ FORGE_MCP_TOKEN: "cached" });
    setRoute("/v1/env", { response: { body: cached } });

    const first = forge();
    expect(await first.state()).toEqual(cached);

    const second = forge();
    expect(await second.state()).toEqual(cached);
    expect(await second.state()).toEqual(cached);
    expect(requestCounts.get("/v1/env")).toBe(1);
  });

  test("fetches, validates, persists, and caches a fresh environment", async () => {
    const first = environment({ FORGE_MCP_TOKEN: "first" });
    const second = environment({ FORGE_MCP_TOKEN: "second" });
    let response = first;
    setRoute("/v1/env", { handler: () => ({ body: response }) });

    const instance = forge();
    expect(await instance.state()).toEqual(first);
    expect(await instance.state()).toEqual(first);
    response = second;
    expect(await instance.state(true)).toEqual(second);
    expect(await instance.state()).toEqual(second);

    expect(requestCounts.get("/v1/env")).toBe(2);
    expect(await store.get(Store.Environment)).toEqual(second);
  });

  test("rejects a malformed environment without persisting it", async () => {
    setRoute("/v1/env", { response: { body: { signedIn: true, env: {} } } });

    await expect(forge().state(true)).rejects.toBeInstanceOf(ForgeNotReady);
    expect(await store.get(Store.Environment)).toBeUndefined();
  });
});

describe("Forge OpenCode resources", () => {
  test("derives and validates the OpenCode configuration", async () => {
    const bootstrap = await mkdtemp(join(tmpdir(), "forge-bootstrap-"));
    directories.push(bootstrap);
    await Promise.all(
      ["opencode-agents", "opencode-commands", "opencode-themes", "opencode-plugins"].map((name) =>
        mkdir(join(bootstrap, name)),
      ),
    );
    setRoute("/v1/env", {
      response: {
        body: environment({
          FORGE_TERMINAL_BOOTSTRAP_DIR: bootstrap,
          FORGE_OPENCODE_ATTACH_URL: "http://127.0.0.1:4096",
        }),
      },
    });

    expect(await forge().opencode()).toEqual({
      bin: "/usr/local/bin/opencode",
      directories: {
        agents: join(bootstrap, "opencode-agents"),
        commands: join(bootstrap, "opencode-commands"),
        themes: join(bootstrap, "opencode-themes"),
        plugins: join(bootstrap, "opencode-plugins"),
      },
      permissions: ["edit", "write"],
      bridge: {
        web: { file: "/tmp/web-bridge", url: "http://127.0.0.1:4096" },
        notifier: "/tmp/notifier",
      },
    });
  });

  test("identifies an inaccessible OpenCode directory", async () => {
    const bootstrap = await mkdtemp(join(tmpdir(), "forge-bootstrap-"));
    directories.push(bootstrap);
    setRoute("/v1/env", {
      response: { body: environment({ FORGE_TERMINAL_BOOTSTRAP_DIR: bootstrap }) },
    });

    await expect(forge().opencode()).rejects.toEqual(
      expect.objectContaining({
        name: "ForgeNotReady",
        message: expect.stringContaining("directory agents is not accessible"),
      }),
    );
  });

  test("enriches agents with catalog model configuration", async () => {
    const bootstrap = await mkdtemp(join(tmpdir(), "forge-agents-"));
    directories.push(bootstrap);
    await Promise.all(
      ["opencode-agents", "opencode-commands", "opencode-themes", "opencode-plugins"].map((name) =>
        mkdir(join(bootstrap, name)),
      ),
    );
    await Bun.write(
      join(bootstrap, "opencode-agents", "reviewer.md"),
      "---\ndescription: Reviews code\n---\nReview.\n",
    );
    setRoute("/v1/env", {
      response: { body: environment({ FORGE_TERMINAL_BOOTSTRAP_DIR: bootstrap }) },
    });
    setRoute("/v1/models", { response: { body: modelsResponse() } });

    expect(await forge().agents()).toEqual({
      reviewer: {
        name: "reviewer",
        description: "Reviews code",
        prompt: "Review.\n",
        model: "forge/openai/gpt-5.6-luna",
        variant: "high",
      },
    });
  });
});

describe("Forge.usage", () => {
  test("returns undefined when no snapshot is configured", async () => {
    setRoute("/v1/env", { response: { body: environment() } });

    expect(await forge().usage()).toBeUndefined();
  });
});

import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ForgeEnvironment } from "../../src/lib/types";

import { ForgeError } from "../../src/lib/errors";
import { Forge } from "../../src/lib/forge";
import { Store, store } from "../../src/lib/store";

const originalFetch = globalThis.fetch;
const directories: string[] = [];

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
        defaultModelId: "openai/gpt-5",
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

function forge(): Forge {
  return new Forge("/Applications/Forge.app/Contents/MacOS/Forge", "http://forge.test", "token");
}

function mockRequest<Response>(instance: Forge, implementation: () => Response) {
  return spyOn(instance, "request").mockResolvedValue(implementation());
}

afterEach(async () => {
  globalThis.fetch = originalFetch;
  mock.restore();
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true })));
});

describe("Forge.request", () => {
  test("sends authenticated requests while preserving options and caller headers", async () => {
    const fetchMock = mock(async (_input: string | URL | Request, _init?: RequestInit) =>
      Response.json({ value: 42 }),
    );
    globalThis.fetch = Object.assign(
      (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
        fetchMock(input, init),
      {
        preconnect: originalFetch.preconnect,
      },
    );

    const result = await forge().request<{ value: number }>("/v1/value", {
      method: "POST",
      headers: { "X-Request-ID": "request-1", Authorization: "Bearer wrong-token" },
      body: "payload",
    });

    expect(result).toEqual({ value: 42 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://forge.test/v1/value");
    expect(options).toMatchObject({ method: "POST", body: "payload", redirect: "error" });
    const headers = new Headers(options?.headers);
    expect(headers.get("Authorization")).toBe("Bearer token");
    expect(headers.get("X-Request-ID")).toBe("request-1");
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  test("turns a non-success response into ForgeNotReady", async () => {
    const fetchMock = mock(
      async () => new Response("unavailable", { status: 503, statusText: "Service Unavailable" }),
    );
    globalThis.fetch = Object.assign(() => fetchMock(), { preconnect: originalFetch.preconnect });

    await expect(forge().request("/v1/ping")).rejects.toEqual(
      expect.objectContaining({
        name: "ForgeNotReady",
        message:
          "Forge is not reachable. Request to /v1/ping failed with status 503 Service Unavailable.",
      }),
    );
  });
});

describe("Forge response validation", () => {
  test("ping accepts a valid response", async () => {
    const instance = forge();
    mockRequest(instance, () => ({ ok: true, signedIn: true, version: "0.2.179" }));

    expect(await instance.ping()).toEqual({ ok: true, signedIn: true, version: "0.2.179" });
  });

  test("ping rejects a malformed response", async () => {
    const instance = forge();
    mockRequest(instance, () => ({ ok: "yes", version: 1 }));

    await expect(instance.ping()).rejects.toBeInstanceOf(ForgeError);
    await expect(instance.ping()).rejects.toThrow("Forge ping response is malformed.");
  });

  test("catalog parses valid data and degrades to undefined for invalid data", async () => {
    const valid = forge();
    valid.env = mock(async () => environment());
    expect(await valid.catalog()).toMatchObject({
      source: "forge",
      defaultModelId: "openai/gpt-5",
    });

    const invalidJson = forge();
    invalidJson.env = mock(async () => environment({ FORGE_OPENCODE_MODEL_CATALOG_JSON: "{" }));
    expect(await invalidJson.catalog()).toBeUndefined();

    const invalidSchema = forge();
    invalidSchema.env = mock(async () =>
      environment({ FORGE_OPENCODE_MODEL_CATALOG_JSON: JSON.stringify({ source: 42 }) }),
    );
    expect(await invalidSchema.catalog()).toBeUndefined();
  });

  test("mcp exposes the configured endpoint without leaking errors", async () => {
    const valid = forge();
    valid.env = mock(async () => environment());
    expect(await valid.mcp()).toEqual({
      type: "remote",
      url: "http://127.0.0.1:4312/mcp",
      headers: { Authorization: "Bearer mcp-token" },
    });

    const unavailable = forge();
    unavailable.env = mock(async () => {
      throw new Error("unavailable");
    });
    expect(await unavailable.mcp()).toBeUndefined();
  });
});

describe("Forge.env", () => {
  test("hydrates from persistent storage and then uses its in-memory cache", async () => {
    const cached = environment({ FORGE_MCP_TOKEN: "cached" });
    const get = spyOn(store, "get").mockResolvedValue(cached);
    const instance = forge();
    const request = mockRequest(instance, () => environment({ FORGE_MCP_TOKEN: "remote" }));

    expect(await instance.env()).toBe(cached);
    expect(await instance.env()).toBe(cached);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(Store.Environment);
    expect(request).not.toHaveBeenCalled();
  });

  test("fetches, validates, persists, and caches a fresh environment", async () => {
    const first = environment({ FORGE_MCP_TOKEN: "first" });
    const second = environment({ FORGE_MCP_TOKEN: "second" });
    spyOn(store, "get").mockResolvedValue(undefined);
    const set = spyOn(store, "set").mockResolvedValue(undefined);
    const instance = forge();
    let response = first;
    const request = mockRequest(instance, () => response);

    expect(await instance.env()).toEqual(first);
    expect(await instance.env()).toEqual(first);
    response = second;
    request.mockResolvedValue(response);
    expect(await instance.env(true)).toEqual(second);
    expect(await instance.env()).toEqual(second);

    expect(request).toHaveBeenCalledTimes(2);
    expect(set).toHaveBeenNthCalledWith(1, Store.Environment, first);
    expect(set).toHaveBeenNthCalledWith(2, Store.Environment, second);
  });

  test("rejects a malformed environment without persisting it", async () => {
    spyOn(store, "get").mockResolvedValue(undefined);
    const set = spyOn(store, "set").mockResolvedValue(undefined);
    const instance = forge();
    mockRequest(instance, () => ({ signedIn: true, env: {} }));

    await expect(instance.env()).rejects.toBeInstanceOf(ForgeError);
    expect(set).not.toHaveBeenCalled();
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
    const instance = forge();
    instance.env = mock(async () =>
      environment({
        FORGE_TERMINAL_BOOTSTRAP_DIR: bootstrap,
        FORGE_OPENCODE_ATTACH_URL: "http://127.0.0.1:4096",
      }),
    );

    expect(await instance.opencode()).toEqual({
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
    const instance = forge();
    instance.env = mock(async () => environment({ FORGE_TERMINAL_BOOTSTRAP_DIR: bootstrap }));

    await expect(instance.opencode()).rejects.toEqual(
      expect.objectContaining({
        name: "ForgeNotReady",
        message: expect.stringContaining("directory agents is not accessible"),
      }),
    );
  });

  test("enriches agents with catalog model configuration", async () => {
    const path = await mkdtemp(join(tmpdir(), "forge-agents-"));
    directories.push(path);
    await Bun.write(join(path, "reviewer.md"), "---\ndescription: Reviews code\n---\nReview.\n");
    const instance = forge();
    instance.opencode = mock(async () => ({
      bin: "opencode",
      directories: { agents: path, commands: path, themes: path, plugins: path },
      permissions: [],
      bridge: { web: { file: "", url: undefined }, notifier: "" },
    }));
    instance.catalog = mock(async () => ({
      source: "forge",
      defaultModelId: "gpt-5",
      models: [],
      agents: [{ role: "reviewer", model: "gpt-5", reasoningEffort: "high" }],
    }));
    instance.provider = mock(async () => ({
      id: "forge",
      name: "Forge",
      package: "provider",
      api: { endpoint: "", key: "", headers: {} },
      models: {},
    }));

    expect(await instance.agents()).toEqual({
      reviewer: {
        name: "reviewer",
        description: "Reviews code",
        prompt: "Review.\n",
        model: "forge/gpt-5",
        variant: "high",
      },
    });
  });
});

describe("Forge.usage", () => {
  test("returns undefined when no snapshot is configured", async () => {
    const instance = forge();
    instance.env = mock(async () => environment());

    expect(await instance.usage()).toBeUndefined();
  });
});

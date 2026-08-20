import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, setDefaultTimeout, test } from "bun:test";

import { prompt } from "../scripts/prompt";
import { createForge } from "../src/index";
import { handshake } from "../src/lib/handshake";

const LIVE_TEST_TIMEOUT = 30_000;

setDefaultTimeout(LIVE_TEST_TIMEOUT);

type ForgeClient = Awaited<ReturnType<typeof createForge>>;

let forgePromise: Promise<ForgeClient> | undefined;

function connect(): Promise<ForgeClient> {
  return (forgePromise ??= createForge());
}

test.serial("parses the default Forge handshake", async () => {
  const result = await handshake();

  expect(result.version).toEqual(expect.any(Number));
  expect(result.version).toBeGreaterThan(0);
  expect(result.host).toEqual(expect.any(String));
  expect(result.host.length).toBeGreaterThan(0);
  expect(Number.isInteger(result.port)).toBe(true);
  expect(result.port).toBeGreaterThan(0);
  expect(result.token).toEqual(expect.any(String));
  expect(result.token.length).toBeGreaterThan(0);
  expect(Number.isInteger(result.pid)).toBe(true);
  expect(result.pid).toBeGreaterThan(0);
  expect(result.appPath).toEqual(expect.any(String));
  expect(result.appPath.length).toBeGreaterThan(0);
  expect(Number.isNaN(Date.parse(result.started))).toBe(false);
});

test.serial("can determine forge status", async () => {
  const forge = await connect();
  const status = await forge.status();

  expect(status.ok).toBe(true);
  expect(status.signedIn).toBe(true);
  expect(status.version).toEqual(expect.any(String));
  expect(status.version.length).toBeGreaterThan(0);
});

test.serial("can call .agents(), .commands(), and .opencode() without errors", async () => {
  const forge = await connect();

  await forge.agents();
  await forge.commands();
  await forge.opencode();
});

test.serial("returns the Forge environment and model catalog", async () => {
  const forge = await connect();
  const environment = await forge.state(true);
  const catalog = await forge.api.models();

  expect(environment.signedIn).toBe(true);
  expect(environment.opencodeBin).toEqual(expect.any(String));
  expect(environment.opencodeBin.length).toBeGreaterThan(0);
  expect(environment.env.FORGE_MCP_URL).toEqual(expect.any(String));
  expect(environment.env.FORGE_MCP_URL.length).toBeGreaterThan(0);
  expect(environment.env.FORGE_OPENCODE_MODEL_CATALOG_JSON).toEqual(expect.any(String));
  expect(environment.env.FORGE_OPENCODE_MODEL_CATALOG_JSON.length).toBeGreaterThan(0);

  expect(catalog).toBeDefined();
  expect(catalog?.source).toEqual(expect.any(String));
  expect(catalog?.source.length).toBeGreaterThan(0);
  expect(catalog?.opencode.defaultModelId).toEqual(expect.any(String));
  expect(catalog?.opencode.defaultModelId?.length).toBeGreaterThan(0);
  expect(Array.isArray(catalog?.opencode.models)).toBe(true);
  expect(catalog?.opencode.models.length).toBeGreaterThan(0);
  expect(Array.isArray(catalog?.opencode.agents)).toBe(true);
});

test.serial("lists tools through the configured Forge MCP endpoint", async () => {
  const forge = await connect();
  const mcp = await forge.mcp();

  expect(mcp).toBeDefined();
  if (!mcp) {
    throw new Error("Forge MCP configuration is unavailable.");
  }

  expect(mcp.type).toBe("remote");
  expect(mcp.url).toEqual(expect.any(String));
  expect(mcp.url.length).toBeGreaterThan(0);

  const client = new Client({
    name: "forge-core-live-test",
    version: "0.0.0",
  });
  const transport = new StreamableHTTPClientTransport(new URL(mcp.url), {
    requestInit: {
      headers: mcp.headers,
    },
  });

  try {
    await client.connect(transport);
    const { tools } = await client.listTools();

    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(tool.name).toEqual(expect.any(String));
      expect(tool.name.length).toBeGreaterThan(0);
    }
  } finally {
    await client.close();
  }
});

test.serial(
  "model reasoning options are available",
  async () => {
    const forge = await connect();
    const provider = await forge.provider();

    expect(provider).toBeDefined();
    if (!provider) {
      throw new Error("Forge provider configuration is unavailable.");
    }

    for (const reasoningEffort of ["low", "medium", "high"] as const) {
      const result = await prompt(
        provider,
        "google/gemini-3.7-flash",
        "Reply with the single word ok.",
        { reasoningEffort },
      );

      expect(result.text.trim().length).toBeGreaterThan(0);
    }
  },
  { timeout: 90_000 },
);

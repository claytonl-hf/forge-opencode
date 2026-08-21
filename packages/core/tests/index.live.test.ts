import { expect, test } from "vitest";

import { createForge } from "#index";

const LIVE_TEST_TIMEOUT = 30_000;

type ForgeClient = Awaited<ReturnType<typeof createForge>>;

let forgePromise: Promise<ForgeClient> | undefined;

function connect(): Promise<ForgeClient> {
  return (forgePromise ??= createForge());
}

test("can determine forge status", { timeout: LIVE_TEST_TIMEOUT }, async () => {
  const forge = await connect();
  const status = await forge.status();

  expect(status.ok).toBe(true);
  expect(status.signedIn).toBe(true);
  expect(status.version).toEqual(expect.any(String));
  expect(status.version.length).toBeGreaterThan(0);
});

test(
  "can call .agents(), .commands(), and .opencode() without errors",
  { timeout: LIVE_TEST_TIMEOUT },
  async () => {
    const forge = await connect();

    await forge.agents();
    await forge.commands();
    await forge.opencode();
  },
);

test("returns the Forge provider configuration", { timeout: LIVE_TEST_TIMEOUT }, async () => {
  const forge = await connect();
  const provider = await forge.provider();

  expect(provider.id).toBe("forge");
  expect(provider.api.endpoint).toEqual(expect.any(String));
  expect(provider.api.endpoint.length).toBeGreaterThan(0);
  expect(provider.api.key).toEqual(expect.any(String));
  expect(provider.api.key.length).toBeGreaterThan(0);
});

test(
  "returns the Forge environment and model catalog",
  { timeout: LIVE_TEST_TIMEOUT },
  async () => {
    const forge = await connect();
    const environment = await forge.state(true);
    const models = await forge.models();

    expect(environment.signedIn).toBe(true);
    expect(environment.opencodeBin).toEqual(expect.any(String));
    expect(environment.opencodeBin.length).toBeGreaterThan(0);
    expect(environment.env.FORGE_MCP_URL).toEqual(expect.any(String));
    expect(environment.env.FORGE_MCP_URL.length).toBeGreaterThan(0);
    expect(environment.env.FORGE_OPENCODE_MODEL_CATALOG_JSON).toEqual(expect.any(String));
    expect(environment.env.FORGE_OPENCODE_MODEL_CATALOG_JSON.length).toBeGreaterThan(0);

    expect(models).toBeDefined();
    expect(Object.keys(models).length).toBeGreaterThan(0);
  },
);

test("returns the configured Forge MCP endpoint", { timeout: LIVE_TEST_TIMEOUT }, async () => {
  const forge = await connect();
  const mcp = await forge.mcp();

  expect(mcp).toBeDefined();
  if (!mcp) {
    throw new Error("Forge MCP configuration is unavailable.");
  }

  expect(mcp.type).toBe("remote");
  expect(mcp.url).toEqual(expect.any(String));
  expect(mcp.url.length).toBeGreaterThan(0);
  expect(mcp.headers.Authorization).toEqual(expect.any(String));
  expect(mcp.headers.Authorization.length).toBeGreaterThan(0);
});

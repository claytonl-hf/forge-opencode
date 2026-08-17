import type Forge from "@forge/core";

import { describe, expect, mock, test } from "bun:test";

import type { Config } from "../../../src/platform/config";

import { ToolsIntegration } from "../../../src/features/tools/integration";

async function configHook(forge: Forge) {
  // SAFETY: ToolsIntegration does not inspect options.
  const integration = await ToolsIntegration(forge, {} as never);
  // SAFETY: the tools server adapter does not inspect its PluginInput argument.
  return (await integration.server!({} as never)).config!;
}

describe("tools integration", () => {
  test("installs Forge MCP, commands, and skills while preserving user configuration", async () => {
    const forge = {
      mcp: mock(async () => ({ type: "remote", url: "https://mcp.test" })),
      commands: mock(async () => ({ review: { description: "Review", template: "Review" } })),
    };
    // SAFETY: this fake implements mcp and commands, the only Forge methods used by tools.
    const hook = await configHook(forge as never);
    const config: Config = {
      mcp: { other: { type: "remote", url: "https://other.test" } },
      command: { custom: { description: "Custom", template: "Custom" } },
      skills: { paths: ["/custom/skills"] },
    };

    await hook(config);

    expect(config.mcp).toMatchObject({ forge: { url: "https://mcp.test" }, other: {} });
    expect(config.command).toMatchObject({ custom: {}, review: {} });
    expect(config.skills?.paths?.[0]).toBe("/custom/skills");
    expect(config.skills?.paths?.at(-1)).toEndWith("/resources/skills");
  });

  test("tolerates unavailable Forge commands", async () => {
    const forge = {
      mcp: mock(async () => undefined),
      commands: mock(async () => {
        throw new Error("unavailable");
      }),
    };
    // SAFETY: this fake implements mcp and commands, the only Forge methods used by tools.
    const hook = await configHook(forge as never);
    const config: Config = {
      command: { custom: { description: "Custom", template: "Custom" } },
    };

    await hook(config);

    expect(config.command).toEqual({ custom: { description: "Custom", template: "Custom" } });
  });
});

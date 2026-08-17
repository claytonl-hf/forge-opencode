import { describe, expect, mock, test } from "bun:test";

import { WebIntegration } from "../../../src/features/web/integration";
import { ForgeOptions } from "../../../src/plugin/options";

function forge() {
  return {
    opencode: mock(async () => ({
      bridge: { web: { file: "/tmp/web-bridge", url: "http://localhost:4096" } },
    })),
  };
}

describe("web integration", () => {
  test("owns its command and Forge sidebar line contributions", async () => {
    const instance = forge();
    const options = { value: ForgeOptions.parse({}) };
    // SAFETY: WebIntegration only calls forge.opencode and reads options.value during setup.
    const integration = await WebIntegration(instance as never, options as never);
    // SAFETY: setup passes the API through to lazy command and slot handlers without reading it.
    const contribution = await integration.tui!({} as never);

    expect(contribution.commands?.map(({ name }) => name)).toEqual(["forge:web"]);
    expect(contribution.slots?.sidebar_content).toBeArrayOfSize(1);
    expect(instance.opencode).toHaveBeenCalledTimes(1);
  });

  test("keeps the command but omits the row when the web component is disabled", async () => {
    const options = {
      value: ForgeOptions.parse({ tui: { components: { web: false } } }),
    };
    // SAFETY: WebIntegration only calls forge.opencode and reads options.value during setup.
    const integration = await WebIntegration(forge() as never, options as never);
    // SAFETY: setup passes the API through to lazy command and slot handlers without reading it.
    const contribution = await integration.tui!({} as never);

    expect(contribution.commands).toHaveLength(1);
    expect(contribution.slots).toEqual({});
  });
});

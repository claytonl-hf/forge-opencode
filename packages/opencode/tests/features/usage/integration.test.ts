import { describe, expect, test } from "bun:test";

import { UsageIntegration } from "../../../src/features/usage/integration";
import { ForgeOptions } from "../../../src/plugin/options";

describe("usage integration", () => {
  test("owns its home status and Forge sidebar line", async () => {
    const options = { value: ForgeOptions.parse({}) };
    // SAFETY: UsageIntegration only retains Forge and reads options.value during setup.
    const integration = await UsageIntegration({} as never, options as never);
    // SAFETY: setup passes the API through to lazy slot renderers without reading it.
    const contribution = await integration.tui!({} as never);

    expect(contribution.slots?.home_bottom).toBeFunction();
    expect(contribution.slots?.sidebar_content).toBeArrayOfSize(1);
  });

  test("contributes no slots when usage is disabled", async () => {
    const options = {
      value: ForgeOptions.parse({ tui: { components: { usage: false } } }),
    };
    // SAFETY: UsageIntegration only retains Forge and reads options.value during setup.
    const integration = await UsageIntegration({} as never, options as never);
    // SAFETY: disabled setup does not read the API.
    const contribution = await integration.tui!({} as never);

    expect(contribution.slots).toEqual({});
  });
});

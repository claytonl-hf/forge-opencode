import { describe, expect, test } from "vitest";

import { ForgeDefaultOptions, ForgeOptions } from "#plugin/options";

describe("Forge TUI worker options", () => {
  test("enables workers by default", () => {
    expect(ForgeDefaultOptions.tui.components).toBe(true);
    expect(ForgeOptions.parse({}).tui.components).toBe(true);
    expect(
      ForgeOptions.parse({ tui: { components: { logo: true, usage: true } } }).tui.components,
    ).toMatchObject({ workers: true });
  });

  test("allows workers to be disabled independently", () => {
    const options = ForgeOptions.parse({
      tui: { components: { workers: false } },
    });

    expect(options.tui.components).toMatchObject({
      logo: true,
      usage: true,
      web: true,
      profile: true,
      workers: false,
    });
  });
});

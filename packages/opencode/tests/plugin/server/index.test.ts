import { expect, test } from "bun:test";

test("server entry loads without a TUI JSX runtime", async () => {
  await expect(import("../../../src/plugin/server/index")).resolves.toBeDefined();
});

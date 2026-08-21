import { expect, test } from "vitest";

test("server entry loads without a TUI JSX runtime", async () => {
  await expect(import("#plugin/server/index")).resolves.toBeDefined();
});

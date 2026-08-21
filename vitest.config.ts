import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "#features": resolve(root, "packages/opencode/src/features"),
      "#platform": resolve(root, "packages/opencode/src/platform"),
      "#plugin": resolve(root, "packages/opencode/src/plugin"),
      "#lib": resolve(root, "packages/core/src/lib"),
      "#index": resolve(root, "packages/core/src/index.ts"),
    },
  },
  test: {
    include: ["packages/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
  },
});

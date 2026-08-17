import { defineConfig } from "oxfmt";
import { AgentConfigLocations } from "./oxlint.config";

export default defineConfig({
  ignorePatterns: AgentConfigLocations,
  sortPackageJson: true,
  sortImports: {
    groups: [
      "type-import",
      ["value-builtin", "value-external"],
      "type-internal",
      "value-internal",
      ["type-parent", "type-sibling", "type-index"],
      ["value-parent", "value-sibling", "value-index"],
      "unknown",
    ],
  },
  overrides: [
    {
      files: ["*.jsonc"],
      options: {
        trailingComma: "none",
      },
    },
  ],
});

import { existsSync } from "node:fs";

import { AgentConfigLocations } from "./oxlint.config.ts";

const ExistingAgentConfigLocations = AgentConfigLocations.filter((pattern) =>
  existsSync(pattern.replace(/\/\*\*$/, "")),
);

export default {
  ignore: ExistingAgentConfigLocations,
  workspaces: {
    ".": {
      project: ["**/*.{ts,tsx,js,mjs}"],
    },
    "packages/opencode": {
      entry: ["tests/**/*.test.ts"],
      project: ["src/**/*.{ts,tsx}", "tests/**/*.ts"],
    },
  },
};

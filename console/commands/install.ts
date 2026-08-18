import * as OpenCode from "@forge/opencode/config/install";
import { migrate } from "@forge/opencode/config/migrate";
import { object, option, message } from "@optique/core";
import { defineCommand } from "@optique/discover/command";

export default defineCommand({
  path: ["install"],
  metadata: {
    aliases: ["i"],
    brief: message`Install Forge for OpenCode.`,
  },
  parser: object({
    profiles: option("--profiles", {
      description: message`Install the preset Forge profiles.`,
    }),
    plugins: option("--plugins", {
      description: message`Install additional plugins.`,
    }),
    mcp: option("--mcp", {
      description: message`Install additional MCP servers.`,
    }),
  }),
  async handler(options) {
    await OpenCode.version().then(async (v) => {
      if (!v || v.satisfies(`<${OpenCode.MinimumVersion}`)) {
        console.error("OpenCode 1.18 or higher is required to install Forge.");
        process.exit(1);
      }
    });

    console.group("Removing previous Forge OpenCode configuration.");
    await migrate().then(async (results) => {
      for (const result of results) {
        console.log(`→ ${result.path}`);
      }
    });
    console.groupEnd();

    console.group("Installing Forge OpenCode plugin.");
    await OpenCode.install(options).then(async (results) => {
      for (const result of results) {
        console.log(`→ ${result.path}`);
      }
    });
    console.groupEnd();
  },
});

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
    profiles: option("-p", "--profiles", {
      description: message`Install the preset Forge profiles.`,
    }),
    mcp: option("-m", "--mcp", {
      description: message`Install additional MCP servers.`,
    }),
  }),
  async handler({ profiles, mcp }) {
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
    await OpenCode.install({ profiles, mcp }).then(async (results) => {
      for (const result of results) {
        console.log(`→ ${result.path}`);
      }
    });
    console.groupEnd();
  },
});

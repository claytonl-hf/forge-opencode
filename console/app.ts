import { createForge, ForgeError } from "@forge/core";
import { message } from "@optique/core";
import { runProgram } from "@optique/discover";

await runProgram({
  metadata: {
    name: "forge",
    description: message`Humanforce Forge integration for AI agent harnesses`,
  },
  hooks: {
    async beforeEach() {
      try {
        await createForge().then((forge) => forge.ping());
      } catch (error) {
        if (error instanceof ForgeError) {
          console.error(error.message);
          process.exit(1);
        }
      }
    },
  },
  commands: [(await import("./commands/install")).default],
});

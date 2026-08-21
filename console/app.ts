import Forge, { createForge, ForgeError } from "@forge/core";
import { message } from "@optique/core";
import { runProgram } from "@optique/discover";

type Context = { forge?: Forge };

export const context: Context = {};

export async function run() {
  const commands = await Promise.all([
    import("./commands/install"),
    import("./commands/debug"),
  ]).then((modules) => {
    return modules.map((module) => module.default);
  });

  return await runProgram({
    metadata: {
      name: "forge",
      description: message`Humanforce Forge integration for AI agent harnesses`,
    },
    hooks: {
      async beforeEach() {
        try {
          await createForge().then(async (forge) => {
            await forge.status();
            context.forge = forge;
          });
        } catch (error) {
          if (error instanceof ForgeError) {
            console.error(error.message);
            process.exit(1);
          }
        }
      },
    },
    commands,
  });
}

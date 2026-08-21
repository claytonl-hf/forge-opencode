// oxlint-disable anti-slop/no-runtime-typeof anti-slop/no-unknown-parameters
import { object, option, message, multiple, argument, choice } from "@optique/core";
import { withDefault } from "@optique/core/modifiers";
import { defineCommand } from "@optique/discover/command";
import { inspect } from "node:util";

import { context } from "../app";

const Properties = ["info", "models", "env", "provider", "opencode", "agents"] as const;
type Property = (typeof Properties)[number];

function format(value: unknown) {
  return inspect(value, { colors: !process.env.NO_COLOR, depth: null });
}

function isPrimitive(value: unknown): boolean {
  return value === null || typeof value !== "object";
}

function render(input: unknown, label?: string): void {
  if (input == null) return;

  // Single primitive
  if (typeof input !== "object") {
    console.log(label ? `${label}: ${format(input)}` : format(input));
    return;
  }

  // Array of primitives (join on one line)
  if (Array.isArray(input) && input.every(isPrimitive)) {
    const text = input.map(format).join(", ");
    console.log(label ? `${label}: ${text}` : text);
    return;
  }

  // Labeled complex object or array (group and recurse)
  if (label) {
    console.group(label);
    render(input);
    console.groupEnd();
    return;
  }

  // Unlabeled complex array or object entries
  if (Array.isArray(input)) {
    for (const item of input) render(item);
  } else {
    for (const [key, value] of Object.entries(input)) {
      render(value, key);
    }
  }
}

export default defineCommand({
  path: ["debug"],
  metadata: {
    brief: message`Debugging and troubleshooting tools.`,
  },
  parser: object({
    json: option("--json", {
      description: message`Output the result in JSON format.`,
    }),
    properties: withDefault(
      multiple(
        argument(choice(Properties), {
          description: message`The Forge properties to include in the output.`,
        }),
        { min: 1 },
      ),
      // SAFETY: "info" is a valid Property choice defined in the choice() constraint
      ["info"] as Property[],
    ),
  }),
  async handler({ json, properties }) {
    const has = async function has<T>(
      key: Property,
      value: () => T | Promise<T>,
    ): Promise<T | undefined> {
      return properties.includes(key) ? await value() : undefined;
    };
    const data = {
      ...(await has("info", async () => ({
        path: context.forge?.path,
        uri: context.forge?.uri,
        token: context.forge?.token,
        ...(await context.forge?.status().then(({ version }) => ({ version }))),
      }))),
      ...(await has("env", async () => ({
        env: await context.forge?.state().then(({ env }) => env),
      }))),
      ...(await has("models", async () => ({ models: await context.forge?.models() }))),
      ...(await has("provider", async () => ({ provider: await context.forge?.provider() }))),
      ...(await has("opencode", async () => ({ opencode: await context.forge?.opencode() }))),
      ...(await has("agents", async () => ({ agents: await context.forge?.agents() }))),
    };
    const output = Object.keys(data).length === 1 ? Object.values(data)[0] : data;

    if (json) {
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    render(output);
  },
});

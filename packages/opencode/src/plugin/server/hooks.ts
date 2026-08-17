import type { Hooks } from "@opencode-ai/plugin";

export function createHooks(input: Hooks[]): Hooks {
  const output: Hooks = {};
  const configs = input.flatMap(({ config }) => (config ? [config] : []));
  const events = input.flatMap(({ event }) => (event ? [event] : []));
  const disposals = input.flatMap(({ dispose }) => (dispose ? [dispose] : []));
  const systemTransforms = input.flatMap(({ "experimental.chat.system.transform": transform }) =>
    transform ? [transform] : [],
  );
  const tools = Object.assign({}, ...input.flatMap(({ tool }) => (tool ? [tool] : [])));

  if (configs.length > 0) {
    output.config = async (config) => {
      for (const hook of configs) await hook(config);
    };
  }
  if (events.length > 0) {
    output.event = async (event) => {
      for (const hook of events) await hook(event);
    };
  }
  if (disposals.length > 0) {
    output.dispose = async () => {
      for (const hook of disposals) await hook();
    };
  }
  if (systemTransforms.length > 0) {
    output["experimental.chat.system.transform"] = async (input, output) => {
      for (const hook of systemTransforms) await hook(input, output);
    };
  }
  if (Object.keys(tools).length > 0) output.tool = tools;

  return output;
}

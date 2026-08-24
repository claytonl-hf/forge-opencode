import { createPluginStore } from "#plugin/store";

export function createEmptyPluginStore() {
  return createPluginStore({ models: async () => ({}), usage: async () => undefined });
}

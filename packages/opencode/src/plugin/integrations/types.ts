import type Forge from "@forge/core";
import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import type {
  KeyEvent,
  Renderable,
  TuiHostSlotMap,
  TuiPluginApi,
  TuiSlotPlugin,
} from "@opencode-ai/plugin/tui";
import type { Command } from "@opentui/keymap";

import type { UseForgeOptions } from "#plugin/options";

export type TuiCommand = Command<Renderable, KeyEvent>;
export type TuiSlot<Name extends keyof TuiHostSlotMap> = NonNullable<TuiSlotPlugin["slots"][Name]>;
export type TuiSlots = {
  [Name in keyof TuiHostSlotMap]?: Name extends "sidebar_content"
    ? TuiSlot<Name> | TuiSlot<Name>[]
    : TuiSlot<Name>;
};
export type TuiOutput = {
  commands: TuiCommand[];
  slots: TuiSlots[];
};

type ServerIntegration = (input: PluginInput) => Promise<Hooks>;
type TuiIntegration = (api: TuiPluginApi) => Promise<{
  commands?: TuiCommand[];
  slots?: TuiSlots;
}>;

export type Integration = (
  forge: Forge,
  options: UseForgeOptions,
) => Promise<{
  server?: ServerIntegration;
  tui?: TuiIntegration;
}>;

/** @jsxImportSource @opentui/solid */
import type { KeyEvent, TuiPluginApi } from "@opencode-ai/plugin/tui";
import type { JSX } from "@opentui/solid";

import { RGBA, type ScrollBoxRenderable, TextAttributes } from "@opentui/core";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";

import type { ProfileSessionMetadata, SessionProfile } from "./profile";

import { getProfileMetadata, resolveProfileName, type Profile } from "./profile";

export const DesktopProfile = Symbol("forge-desktop-profile");
export type ProfileSelection = string | typeof DesktopProfile | null;
export enum ProfileScope {
  Session = "session",
  Global = "global",
}
const DesktopProfileConfig = "default";

type SelectOption<Value> = {
  title: string;
  description?: string;
  descriptionItalic?: boolean;
  value: Value;
  editable?: boolean;
  columns?: boolean;
  before?: JSX.Element;
};

function ProfileSelect<Value>(props: {
  api: TuiPluginApi;
  title: string;
  options: SelectOption<Value>[];
  current?: Value;
  search?: boolean;
  onSelect: (value: Value) => void;
  onEdit: (value: Value) => void;
  onClose: () => void;
  onKey: (event: KeyEvent, actions: SelectActions) => boolean;
  scope?: () => ProfileScope;
  onScopeChange?: (scope: ProfileScope) => void;
  footer: (actions: { select: () => void; edit: () => void }) => JSX.Element;
}) {
  const [query, setQuery] = createSignal("");
  const filtered = createMemo(() => filterOptions(props.options, query()));
  const initial = Math.max(
    0,
    filtered().findIndex((option) => Object.is(option.value, props.current)),
  );
  const [highlighted, setHighlighted] = createSignal(initial);
  const [currentValue, setCurrentValue] = createSignal(props.current);
  createEffect(() => setCurrentValue(() => props.current));
  let scroll: ScrollBoxRenderable | undefined;

  function move(index: number) {
    const options = filtered();
    if (options.length === 0) return;
    const next = (index + options.length) % options.length;
    const option = options[next];
    if (!option) return;
    setHighlighted(next);
    queueMicrotask(() => reveal(next));
  }

  function reveal(index: number) {
    if (!scroll) return;
    const headers = filtered()
      .slice(0, index + 1)
      .filter((option) => option.before).length;
    const target = scroll.getChildren()[index + headers];
    if (!target) return;
    const offset = target.y - scroll.y;
    if (offset < 0) scroll.scrollBy(offset);
    else if (offset >= scroll.height) scroll.scrollBy(offset - scroll.height + 1);
  }

  function click(option: SelectOption<Value>, index: number) {
    move(index);
    select(option.value);
  }

  function select(value: Value) {
    setCurrentValue(() => value);
    props.onSelect(value);
  }

  function onNavigationKey(event: { name: string }) {
    const key = event.name;
    if (key === "up") move(highlighted() - 1);
    else if (key === "down") move(highlighted() + 1);
    else if (key === "pageup") move(highlighted() - 5);
    else if (key === "pagedown") move(highlighted() + 5);
    else if (key === "home") move(0);
    else if (key === "end") move(filtered().length - 1);
    else return false;
    return true;
  }

  const actions: SelectActions = {
    select: () => {
      const option = filtered()[highlighted()];
      if (option) select(option.value);
    },
    edit: () => {
      const option = filtered()[highlighted()];
      if (option && option.editable !== false) props.onEdit(option.value);
    },
  };

  const disposeKeys = props.api.keymap.intercept("key", (context) => {
    if (!onNavigationKey(context.event) && !props.onKey(context.event, actions)) return;
    context.consume();
  });
  onCleanup(() => {
    disposeKeys();
  });

  return (
    <box gap={1} paddingBottom={1} flexGrow={1}>
      <box paddingLeft={4} paddingRight={4}>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={props.api.theme.current.text} attributes={TextAttributes.BOLD}>
            {props.title}
          </text>
          <text fg={props.api.theme.current.textMuted} onMouseUp={props.onClose}>
            esc
          </text>
        </box>
        <Show when={props.search !== false}>
          <box paddingTop={1}>
            <input
              focused
              placeholder="Search"
              placeholderColor={props.api.theme.current.textMuted}
              focusedBackgroundColor={props.api.theme.current.backgroundPanel}
              focusedTextColor={props.api.theme.current.textMuted}
              cursorColor={props.api.theme.current.primary}
              onInput={(value) => {
                setQuery(value);
                setHighlighted(0);
              }}
            />
          </box>
        </Show>
      </box>
      <scrollbox
        ref={(value: ScrollBoxRenderable) => (scroll = value)}
        maxHeight={14}
        paddingLeft={1}
        paddingRight={1}
        scrollbarOptions={{ visible: false }}
      >
        <For each={filtered()}>
          {(option, index) => {
            const active = () => index() === highlighted();
            const current = () => Object.is(option.value, currentValue());
            const foreground = () =>
              active()
                ? props.api.theme.current.selectedListItemText
                : current()
                  ? props.api.theme.current.primary
                  : props.api.theme.current.text;
            return (
              <>
                {option.before}
                <box
                  paddingLeft={1}
                  paddingRight={3}
                  backgroundColor={
                    active() ? props.api.theme.current.primary : RGBA.fromInts(0, 0, 0, 0)
                  }
                  onMouseDown={() => move(index())}
                  onMouseUp={() => click(option, index())}
                >
                  <box flexDirection="row" gap={1}>
                    <text fg={foreground()}>{current() ? "●" : " "}</text>
                    <box
                      flexGrow={1}
                      flexDirection={option.columns ? "row" : "column"}
                      alignItems={option.columns ? "center" : undefined}
                    >
                      <text
                        width={option.columns ? 20 : undefined}
                        fg={foreground()}
                        attributes={TextAttributes.BOLD}
                      >
                        {option.title}
                      </text>
                      <Show when={option.description}>
                        <text
                          fg={
                            active()
                              ? props.api.theme.current.selectedListItemText
                              : props.api.theme.current.textMuted
                          }
                          wrapMode="word"
                          attributes={option.descriptionItalic ? TextAttributes.ITALIC : undefined}
                        >
                          {option.description}
                        </text>
                      </Show>
                    </box>
                  </box>
                </box>
              </>
            );
          }}
        </For>
      </scrollbox>
      <Show when={props.scope && props.onScopeChange}>
        <box paddingX={4} paddingBottom={1} flexDirection="column">
          <box flexDirection="row">
            <text fg={props.api.theme.current.text}>Apply profile to: </text>
            <box flexDirection="row" backgroundColor={props.api.theme.current.backgroundElement}>
              <For each={Object.values(ProfileScope)}>
                {(scope) => (
                  <box
                    paddingX={1}
                    backgroundColor={
                      props.scope?.() === scope ? props.api.theme.current.primary : undefined
                    }
                    onMouseUp={() => props.onScopeChange?.(scope)}
                  >
                    <text
                      fg={
                        props.scope?.() === scope
                          ? props.api.theme.current.selectedListItemText
                          : undefined
                      }
                      attributes={props.scope?.() === scope ? TextAttributes.BOLD : undefined}
                    >
                      {scope.charAt(0).toUpperCase() + scope.slice(1)}
                    </text>
                  </box>
                )}
              </For>
            </box>
          </box>
        </box>
      </Show>
      {props.footer(actions)}
    </box>
  );
}

export function ModelPicker({
  api,
  profileName,
  target,
  models,
  current,
  ...props
}: {
  api: TuiPluginApi;
  profileName: string;
  target: string;
  models: Array<{ provider: string; id: string; name: string; variants: string[] }>;
  current?: { id: string; provider?: string; variant?: string | null };
  onConfirm: (model?: { id: string; provider?: string; variant?: string }) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = createSignal(current ? getModelKey(current) : "");
  const initialVariants: Record<string, string | undefined> = {};
  if (current) initialVariants[getModelKey(current)] = current.variant ?? undefined;
  const [variants, setVariants] = createSignal(initialVariants);
  const options = createMemo<SelectOption<string>[]>(() => [
    { title: "Not set", value: "", columns: true },
    ...models.map((model, index) => ({
      title: model.name,
      value: getModelKey(model),
      description: variants()[getModelKey(model)] ?? "default",
      columns: true,
      before:
        index === 0 ? (
          <box flexDirection="row" paddingLeft={3} paddingTop={1}>
            <text width={20} fg={api.theme.current.textMuted}>
              Model Name
            </text>
            <text fg={api.theme.current.textMuted}>variant</text>
          </box>
        ) : undefined,
    })),
  ]);

  function select(value: string) {
    setSelected(value);
  }

  function cycle(value: string) {
    if (!value) return;
    const model = models.find((item) => getModelKey(item) === value);
    if (!model) return;
    const choices = [undefined, ...model.variants];
    const index = choices.indexOf(variants()[value]);
    const variant = choices[(index + 1) % choices.length];
    setVariants((currentVariants) => ({ ...currentVariants, [value]: variant }));
  }

  function confirm() {
    const key = selected();
    const model = models.find((item) => getModelKey(item) === key);
    props.onConfirm(
      model ? { id: model.id, provider: model.provider, variant: variants()[key] } : undefined,
    );
  }

  return (
    <ProfileSelect
      api={api}
      title={`Select ${modelTargetLabel(target)} for ${profileName}`}
      options={options()}
      current={selected()}
      onSelect={select}
      onEdit={cycle}
      onClose={props.onClose}
      onKey={(event, actions) => {
        if (event.name === "space") actions.select();
        else if (event.name === "t") actions.edit();
        else if (isEnter(event)) confirm();
        else if (event.name === "escape") props.onClose();
        else return false;
        return true;
      }}
      footer={(actions) => (
        <box flexDirection="row" justifyContent="space-between" paddingLeft={4} paddingRight={4}>
          <box flexDirection="row" gap={2}>
            <text fg={api.theme.current.text} onMouseUp={actions.select}>
              Select <span style={{ fg: api.theme.current.textMuted }}>space</span>
            </text>
            <text fg={api.theme.current.text} onMouseUp={actions.edit}>
              Cycle variant <span style={{ fg: api.theme.current.textMuted }}>t</span>
            </text>
          </box>
          <text fg={api.theme.current.text} onMouseUp={confirm}>
            Confirm <span style={{ fg: api.theme.current.textMuted }}>enter</span>
          </text>
        </box>
      )}
    />
  );
}

export function ProfilePicker({
  api,
  profiles,
  current,
  ...props
}: {
  api: TuiPluginApi;
  profiles: Record<string, Profile>;
  current: ProfileSelection;
  onSelect: (selection: ProfileSelection) => void;
  onEdit: (selection: ProfileSelection) => void;
  scope?: () => ProfileScope;
  onScopeChange?: (scope: ProfileScope) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const options: SelectOption<ProfileSelection>[] = [
    {
      title: "None",
      value: null,
      description: "Do not apply any profile",
      editable: false,
    },
    {
      title: "Default",
      value: DesktopProfile,
      description: "Use the models configured in Forge Desktop settings",
      editable: false,
    },
    ...Object.entries(profiles)
      .filter(([key]) => key !== DesktopProfileConfig)
      .map(([key, profile], index) => ({
        title: profile.name ?? key,
        value: key,
        description: profile.description,
        before: index === 0 ? <box height={1} /> : undefined,
      })),
  ];
  const toggleScope = () => {
    if (!props.scope || !props.onScopeChange) return;
    props.onScopeChange(
      props.scope() === ProfileScope.Session ? ProfileScope.Global : ProfileScope.Session,
    );
  };

  return (
    <ProfileSelect
      api={api}
      title="Select model profile"
      options={options}
      current={current}
      scope={props.scope}
      onScopeChange={props.onScopeChange}
      onSelect={props.onSelect}
      onEdit={props.onEdit}
      onClose={props.onClose}
      onKey={(event, actions) => {
        if (event.name === "space") actions.edit();
        else if (event.name === "tab") {
          if (!props.scope || !props.onScopeChange) return false;
          toggleScope();
        } else if (isEnter(event)) {
          actions.select();
          props.onConfirm();
        } else if (event.name === "escape") props.onClose();
        else return false;
        return true;
      }}
      footer={(actions) => (
        <box flexDirection="row" justifyContent="space-between" paddingLeft={4} paddingRight={4}>
          <box flexDirection="row" gap={2}>
            <text fg={api.theme.current.text} onMouseUp={actions.edit}>
              Edit <span style={{ fg: api.theme.current.textMuted }}>space</span>
            </text>
            <Show when={props.scope && props.onScopeChange}>
              <text fg={api.theme.current.text} onMouseUp={toggleScope}>
                Scope <span style={{ fg: api.theme.current.textMuted }}>tab</span>
              </text>
            </Show>
          </box>
          <text
            fg={api.theme.current.text}
            onMouseUp={() => {
              actions.select();
              props.onConfirm();
            }}
          >
            Save <span style={{ fg: api.theme.current.textMuted }}>enter</span>
          </text>
        </box>
      )}
    />
  );
}

export function ProfileEditor({
  api,
  name,
  profile,
  agents,
  models,
  ...props
}: {
  api: TuiPluginApi;
  name: string;
  profile: Profile;
  agents: string[];
  models: Record<string, string>;
  onEdit: (key: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const agentKeys = [
    ...new Set(
      [...agents, ...Object.keys(profile.models)].filter(
        (key) => key !== "$default" && key !== "$small",
      ),
    ),
  ];
  const keys = ["$default", "$small", ...agentKeys];
  return (
    <ProfileSelect
      api={api}
      title={`Edit ${name}`}
      search={false}
      options={keys.map((key, index) => ({
        title: label(key),
        value: key,
        description: modelLabel(profile.models[key], models),
        descriptionItalic: !profile.models[key],
        columns: true,
        before: index === 2 ? <box height={1} /> : undefined,
      }))}
      onSelect={() => {}}
      onEdit={props.onEdit}
      onClose={props.onClose}
      onKey={(event, actions) => {
        if (event.name === "space") actions.edit();
        else if (isEnter(event)) props.onSave();
        else if (event.name === "escape") props.onClose();
        else return false;
        return true;
      }}
      footer={(actions) => (
        <box flexDirection="row" justifyContent="space-between" paddingLeft={4} paddingRight={4}>
          <box flexDirection="row" gap={2}>
            <text fg={api.theme.current.text} onMouseUp={actions.edit}>
              Edit <span style={{ fg: api.theme.current.textMuted }}>space</span>
            </text>
          </box>
          <text fg={api.theme.current.text} onMouseUp={props.onSave}>
            Save <span style={{ fg: api.theme.current.textMuted }}>enter</span>
          </text>
        </box>
      )}
    />
  );
}

export function profileTitle(profile: Profile | undefined, fallback: string) {
  return profile?.name ?? fallback;
}

export function visibleProfileTitle(
  session: ProfileSessionMetadata | undefined,
  parent: ProfileSessionMetadata | undefined,
  globalProfile: string | undefined,
  profiles: Record<string, Profile> | undefined,
): string | undefined {
  const sessionProfile = getProfileMetadata(session?.metadata)?.profile;
  const parentProfile = getProfileMetadata(parent?.metadata)?.profile;
  const key = resolveProfileName(session, parent, globalProfile, profiles);
  const selection = resolveProfileSelection(key, profiles ?? {});
  if (selection === null || selection === DesktopProfile) return undefined;
  const title = profileTitle(profiles?.[selection], selection);
  const resolvedProfile =
    sessionProfile?.id === selection
      ? sessionProfile
      : parentProfile?.id === selection
        ? parentProfile
        : undefined;
  return hasModelOverrides(resolvedProfile) ? `${title}*` : title;
}

export function visibleHomeProfileTitle(
  sessionProfile: SessionProfile,
  globalProfile: string | undefined,
  profiles: Record<string, Profile> | undefined,
): string | undefined {
  const sessionProfileID = sessionProfile?.id ?? globalProfile;
  const title = visibleProfileTitle(undefined, undefined, sessionProfileID, profiles);
  return hasModelOverrides(sessionProfile) && title ? `${title}*` : title;
}

function hasModelOverrides(profile: SessionProfile | undefined) {
  return Object.keys(profile?.models ?? {}).length > 0;
}

export function filterOptions<Value>(options: SelectOption<Value>[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return options;
  return options.filter((option) =>
    `${option.title} ${option.description ?? ""}`.toLowerCase().includes(needle),
  );
}

export function resolveProfileSelection(
  configured: string | undefined,
  profiles: Record<string, Profile>,
): ProfileSelection {
  if (configured === DesktopProfileConfig) {
    return DesktopProfile;
  }
  return configured && profiles[configured] ? configured : null;
}

export function serializeProfileSelection(selection: ProfileSelection) {
  if (selection === DesktopProfile) return DesktopProfileConfig;
  return selection ?? undefined;
}

function label(key: string) {
  if (key === "$default") return "Default model";
  if (key === "$small") return "Small model";
  return key.replaceAll("_", " ");
}

function modelLabel(model: Profile["models"][string] | undefined, models: Record<string, string>) {
  if (!model) return "Not set";
  const name = models[getModelKey(model)] ?? model.id;
  return model.variant ? `${name}:${model.variant}` : name;
}

function getModelKey(model: { id: string; provider?: string }) {
  return `${model.provider ?? "forge"}/${model.id}`;
}

function modelTargetLabel(key: string) {
  if (key === "$default") return "default model";
  if (key === "$small") return "small model";
  return `${label(key)} model`;
}

type SelectActions = {
  select: () => void;
  edit: () => void;
};

function isEnter(event: { name: string }) {
  return ["return", "linefeed", "kpenter"].includes(event.name);
}

/** @jsxImportSource @opentui/solid */

import type { TuiPluginApi, TuiSlotContext } from "@opencode-ai/plugin/tui";

import { Show, createSignal, onCleanup, onMount, type Accessor } from "solid-js";

import type { TuiSlots } from "../../plugin/integrations/types";
import type { UseForgeOptions } from "../../plugin/options";

import { peekPendingProfile, subscribePendingProfile } from "./pending";
import { visibleHomeProfileTitle, visibleProfileTitle } from "./picker";

type Props = TuiSlotContext & {
  api: TuiPluginApi;
  options: UseForgeOptions;
  sessionID?: string;
};

export function ProfileSlots(api: TuiPluginApi, options: UseForgeOptions): TuiSlots {
  return {
    session_prompt_right: (context, props) => (
      <ProfileSlot api={api} options={options} theme={context.theme} sessionID={props.session_id} />
    ),
    home_prompt_right: (context) => (
      <ProfileSlot api={api} options={options} theme={context.theme} />
    ),
  };
}

function ProfileSlot({ api, options, theme, sessionID }: Props) {
  const initialSession = sessionID ? api.state.session.get(sessionID) : undefined;
  const [session, setSession] = createSignal(initialSession);
  const [parent, setParent] = createSignal(
    initialSession?.parentID ? api.state.session.get(initialSession.parentID) : undefined,
  );
  const [pending, setPending] = createSignal(peekPendingProfile());

  function currentTitle() {
    if (!sessionID) {
      return visibleHomeProfileTitle(pending(), options.value.profile, options.value.profiles);
    }
    return visibleProfileTitle(session(), parent(), options.value.profile, options.value.profiles);
  }

  function open(event: { stopPropagation: () => void }) {
    event.stopPropagation();
    api.keymap.dispatchCommand("forge:profile");
  }

  onMount(() => {
    if (!sessionID) {
      const dispose = subscribePendingProfile(setPending);
      onCleanup(dispose);
      return;
    }
    const dispose = api.event.on("session.updated", (event) => {
      const updated = event.properties.info;
      if (updated.id === sessionID) {
        setSession(updated);
        setParent(updated.parentID ? api.state.session.get(updated.parentID) : undefined);
        return;
      }
      if (updated.id === session()?.parentID) setParent(api.state.session.get(updated.id));
    });
    onCleanup(dispose);
  });

  return (
    <Show when={currentTitle()}>
      {(title: Accessor<string>) => (
        <text truncate wrapMode="none" style={{ fg: theme.current.primary }} onMouseUp={open}>
          {title()}
        </text>
      )}
    </Show>
  );
}

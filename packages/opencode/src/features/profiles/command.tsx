/** @jsxImportSource @opentui/solid */
import type { KeyEvent, Renderable, TuiPluginApi } from "@opencode-ai/plugin/tui";
import type { Command } from "@opentui/keymap";

import { createSignal } from "solid-js";

import type { SessionMetadata } from "#common/session";
import type { UseForgeOptions } from "#plugin/options";
import type { PluginStore } from "#plugin/store";

import type { Profile } from "./profile";

import { clearExpectedSessionModel, expectSessionModel } from "./listener";
import {
  DesktopProfile,
  ModelPicker,
  ProfileEditor,
  ProfilePicker,
  ProfileScope,
  type ProfileSelection,
  profileTitle,
  resolveProfileSelection,
  serializeProfileSelection,
} from "./picker";
import { getModelForSession, getProfileMetadata, setProfileModel } from "./profile";

export async function saveProfile(
  selection: ProfileSelection,
  scope: ProfileScope,
  context: {
    api: TuiPluginApi;
    options: UseForgeOptions;
    profiles: Record<string, Profile>;
    store: PluginStore;
  },
): Promise<void> {
  const { api, options, profiles, store } = context;
  const title =
    selection && selection !== DesktopProfile
      ? `Forge profile set to ${profileTitle(profiles[selection], selection)}`
      : selection === DesktopProfile
        ? "Forge Desktop models selected"
        : "Forge profile cleared";
  const profile = serializeProfileSelection(selection);
  const profileName = selection && selection !== DesktopProfile ? selection : undefined;
  const saveGlobal = async () => {
    await options.update((prev) => {
      const next = structuredClone(prev);
      next.profiles = profiles;
      if (profile) next.profile = profile;
      else delete next.profile;
      return next;
    });
  };

  const route = api.route.current;
  if (route.name !== "session") {
    if (scope === ProfileScope.Session) {
      store.session.profile.set(profileName ? { id: profileName } : null);
      api.ui.toast({
        variant: "success",
        title,
        message: "Applies when you start a session.",
        duration: 2500,
      });
      return;
    }

    store.session.profile.set(undefined);
    await saveGlobal();
    api.ui.toast({
      variant: "success",
      title,
      message: "Restart OpenCode to apply the changes.",
      duration: 2500,
    });
    return;
  }

  if (scope === ProfileScope.Global) {
    await saveGlobal();
  }

  // SAFETY: the TUI host's named session route always carries a string sessionID.
  const sessionID = (route as { params: { sessionID: string } }).params.sessionID;
  const session = api.state.session.get(sessionID);
  const metadata: SessionMetadata = { ...session?.metadata };
  const forge = getProfileMetadata(metadata);
  if (profileName) {
    metadata.forge = { ...forge, profile: { id: profileName } };
  } else if (forge) {
    delete forge.profile;
    if (Object.keys(forge).length > 0) metadata.forge = forge;
    else delete metadata.forge;
  }
  const model = getModelForSession(profileName ? profiles[profileName] : undefined, session?.agent);
  if (model) expectSessionModel(sessionID, model);
  try {
    await api.client.session.update({ sessionID, metadata });
  } catch (error) {
    if (model) clearExpectedSessionModel(sessionID);
    throw error;
  }
  store.session.profile.set(profileName ? { id: profileName } : null);
  if (model) {
    try {
      await api.client.v2.session.switchModel({ sessionID, model }, { throwOnError: true });
    } catch {
      clearExpectedSessionModel(sessionID);
      api.ui.toast({
        variant: "error",
        title: "Forge profile saved",
        message: "The profile was saved, but the current session model could not be updated.",
        duration: 4000,
      });
      return;
    }
  }

  api.ui.toast({
    variant: "success",
    title,
    message:
      scope === "global"
        ? "Current session updated. Restart OpenCode to apply the config elsewhere."
        : "Current session updated.",
    duration: 2500,
  });
}

export async function saveEditedProfile(
  options: UseForgeOptions,
  profiles: Record<string, Profile>,
  profileID: string,
  profile: Profile,
): Promise<void> {
  profiles[profileID] = profile;
  await options.update((prev) => ({
    ...structuredClone(prev),
    profiles,
  }));
}

export function ProfileCommand(
  api: TuiPluginApi,
  options: UseForgeOptions,
  store: PluginStore,
): Command<Renderable, KeyEvent> {
  return {
    name: "forge:profile",
    title: "Switch Forge model profile",
    category: "Forge",
    namespace: "palette",
    slashName: "forge:profile",
    run() {
      const profiles = structuredClone(options.value.profiles ?? {});
      const agents = Object.keys(api.state.config.agent ?? {});
      const models = api.state.provider
        .flatMap((provider) =>
          Object.values(provider.models).map((model) => ({ ...model, provider: provider.id })),
        )
        .toSorted((a, b) => a.name.localeCompare(b.name));
      const modelNames = Object.fromEntries(
        models.map((model) => [`${model.provider}/${model.id}`, model.name]),
      );
      let selected: ProfileSelection = resolveProfileSelection(
        store.env.FORGE_PROFILE ?? options.value.profile,
        profiles,
      );
      let editKey = "";
      let editID = "";
      let editDraft: Profile | undefined;
      const [scope, setScope] = createSignal<ProfileScope>(ProfileScope.Session);
      const close = () => {
        api.ui.dialog.clear();
      };

      const confirm = async () => {
        close();
        await saveProfile(selected, scope(), { api, options, profiles, store });
      };

      const showPicker = () => {
        api.ui.dialog.setSize("medium");
        api.ui.dialog.replace(() => (
          <ProfilePicker
            api={api}
            profiles={profiles}
            current={selected}
            scope={scope}
            onScopeChange={(nextScope: ProfileScope) => setScope(nextScope)}
            onSelect={(value) => (selected = value)}
            onEdit={(value) => {
              if (!value || value === DesktopProfile || !profiles[value]) return;
              editID = value;
              editDraft = structuredClone(profiles[editID]);
              showEditor();
            }}
            onConfirm={() => void confirm()}
            onClose={close}
          />
        ));
      };

      const showEditor = () => {
        if (!editDraft) return;
        editKey = "$default";
        api.ui.dialog.setSize("medium");
        api.ui.dialog.replace(() => (
          <ProfileEditor
            api={api}
            name={profileTitle(editDraft, editID)}
            profile={editDraft!}
            agents={agents}
            models={modelNames}
            onEdit={(key) => {
              editKey = key;
              showModels();
            }}
            onSave={() => void saveEdit()}
            onClose={() => {
              editDraft = undefined;
              showPicker();
            }}
          />
        ));
      };

      const showModels = () => {
        if (!editDraft) return;
        api.ui.dialog.replace(() => (
          <ModelPicker
            api={api}
            profileName={profileTitle(editDraft, editID)}
            target={editKey}
            models={models.map((model) => ({
              provider: model.provider,
              id: model.id,
              name: model.name,
              variants: Object.keys(model.variants ?? {}),
            }))}
            current={editDraft!.models[editKey]}
            onConfirm={(model) => {
              setProfileModel(editDraft!, editKey, model);
              showEditor();
            }}
            onClose={showEditor}
          />
        ));
      };

      const saveEdit = async () => {
        if (!editDraft) return;
        await saveEditedProfile(options, profiles, editID, editDraft);
        showPicker();
      };

      showPicker();
    },
  };
}

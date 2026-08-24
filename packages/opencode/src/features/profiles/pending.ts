import type { PluginStore } from "#plugin/store";

import {
  modelForSession,
  PROFILE_METADATA_KEY,
  type ForgeModelRef,
  type Profile,
  type SessionMetadata,
} from "./profile";

export async function applySessionProfile(input: {
  store: PluginStore;
  sessionID: string;
  parentID?: string;
  agent?: string;
  profiles: Record<string, Profile>;
  update(sessionID: string, metadata: SessionMetadata): Promise<void>;
  switchModel(sessionID: string, model: ForgeModelRef): Promise<void>;
}): Promise<void> {
  if (input.parentID) return;

  const name = input.store.session.get();
  if (name == null || name === "") return;

  try {
    await input.update(input.sessionID, { [PROFILE_METADATA_KEY]: name });
  } catch {
    return;
  }

  try {
    const model = modelForSession(input.profiles[name], input.agent);
    if (model) await input.switchModel(input.sessionID, model);
  } catch {
    // The session is already stamped; leave the session profile unchanged.
  }
}

export async function onTuiSessionCreated(input: {
  store: PluginStore;
  sessionID: string;
  parentID?: string;
  agent?: string;
  metadata?: SessionMetadata;
  profiles: Record<string, Profile>;
  getParent(parentID: string): Promise<{ metadata?: SessionMetadata } | undefined>;
  update(sessionID: string, metadata: SessionMetadata): Promise<void>;
  switchModel(sessionID: string, model: ForgeModelRef): Promise<void>;
}): Promise<void> {
  if (!input.parentID) {
    await applySessionProfile(input);
    return;
  }

  if (input.metadata?.[PROFILE_METADATA_KEY] !== undefined) return;

  try {
    const parent = await input.getParent(input.parentID);
    const name = parent?.metadata?.[PROFILE_METADATA_KEY];
    if (!name) return;

    const profile = input.profiles[name];
    if (!profile) return;

    await input.update(input.sessionID, {
      ...input.metadata,
      [PROFILE_METADATA_KEY]: name,
    });
    const model = modelForSession(profile, input.agent);
    if (model) await input.switchModel(input.sessionID, model);
  } catch {
    // Profile metadata is advisory and must never block session creation.
  }
}

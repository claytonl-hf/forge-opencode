import type { ModelRef } from "@opencode-ai/sdk/v2";

import type { SessionMetadata } from "#common/session";
import type { PluginStore } from "#plugin/store";

import { clearExpectedSessionModel, expectSessionModel } from "./listener";
import { getProfileMetadata, getModelForSession, type Profile } from "./profile";

type ApplySessionProfileInput = {
  store: PluginStore;
  sessionID: string;
  parentID?: string;
  agent?: string;
  model?: ModelRef;
  metadata?: SessionMetadata;
  profiles: Record<string, Profile>;
  update(sessionID: string, metadata: SessionMetadata): Promise<void>;
  switchModel(sessionID: string, model: ModelRef): Promise<void>;
};

export async function applySessionProfile(input: ApplySessionProfileInput): Promise<void> {
  if (input.parentID) return;

  const sessionProfile = input.store.session.profile.get();
  if (!sessionProfile?.id) return;

  const profile = input.profiles[sessionProfile.id];
  const models = { ...sessionProfile.models };

  const stampedProfile =
    Object.keys(models).length > 0 ? { id: sessionProfile.id, models } : { id: sessionProfile.id };
  const forge = getProfileMetadata(input.metadata);
  const metadata: SessionMetadata = {
    ...input.metadata,
    forge: {
      ...forge,
      profile: stampedProfile,
    },
  };
  const model = getModelForSession(profile, input.agent, metadata);
  if (model) expectSessionModel(input.sessionID, model);

  try {
    await input.update(input.sessionID, metadata);
  } catch {
    if (model) clearExpectedSessionModel(input.sessionID);
    return;
  }

  try {
    if (model) await input.switchModel(input.sessionID, model);
  } catch {
    if (model) clearExpectedSessionModel(input.sessionID);
    // The session is already stamped; leave the session profile unchanged.
  }
}

type OnTuiSessionCreatedInput = ApplySessionProfileInput & {
  store: PluginStore;
  getParent(parentID: string): Promise<{ metadata?: SessionMetadata } | undefined>;
};

export async function onTuiSessionCreated(input: OnTuiSessionCreatedInput): Promise<void> {
  await applySessionProfile(input);
  if (!input.parentID) return;

  if (getProfileMetadata(input.metadata)?.profile !== undefined) return;

  try {
    const parent = await input.getParent(input.parentID);
    const name = getProfileMetadata(parent?.metadata)?.profile?.id;
    if (!name) return;

    const profile = input.profiles[name];
    if (!profile) return;

    const model = getModelForSession(profile, input.agent);
    if (model) expectSessionModel(input.sessionID, model);

    await input.update(input.sessionID, {
      ...input.metadata,
      forge: {
        ...getProfileMetadata(input.metadata),
        profile: { id: name },
      },
    });
    if (model) await input.switchModel(input.sessionID, model);
  } catch {
    clearExpectedSessionModel(input.sessionID);
    // Profile metadata is advisory and must never block session creation.
  }
}

import type { ModelRef } from "@opencode-ai/sdk/v2";

import type { SessionMetadata } from "#common/session";
import type { PluginStore } from "#plugin/store";

import {
  getProfileMetadata,
  getAgentKey,
  getModelForSession,
  isModelEqual,
  toProfileModel,
  type Profile,
} from "./profile";

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
  const agentKey = getAgentKey(input.agent);
  const models = { ...sessionProfile.models };

  if (input.model?.id) {
    const configured = getModelForSession(profile, input.agent);
    if (!isModelEqual(input.model, configured)) {
      models[agentKey] = toProfileModel(input.model);
    }
  }

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

  try {
    await input.update(input.sessionID, metadata);
  } catch {
    return;
  }

  try {
    const model = getModelForSession(profile, input.agent, metadata);
    if (model) await input.switchModel(input.sessionID, model);
  } catch {
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

    await input.update(input.sessionID, {
      ...input.metadata,
      forge: {
        ...getProfileMetadata(input.metadata),
        profile: { id: name },
      },
    });
    const model = getModelForSession(profile, input.agent);
    if (model) await input.switchModel(input.sessionID, model);
  } catch {
    // Profile metadata is advisory and must never block session creation.
  }
}

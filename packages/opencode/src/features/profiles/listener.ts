import type { EventSessionUpdated, ModelRef } from "@opencode-ai/sdk/v2";

import type { SessionMetadata } from "#common/session";

import {
  getProfileMetadata,
  getAgentKey,
  getModelForSession,
  isModelEqual,
  toProfileModel,
  type Profile,
} from "./profile";

type ProfileSessionListenerInput = {
  getProfiles: () => Record<string, Profile> | undefined;
  getGlobalProfile?: () => string | undefined;
  update: (sessionID: string, metadata: SessionMetadata) => Promise<void>;
};

const EXPECTED_SESSION_MODEL_TTL_MS = 5000;
const expectedSessionModels = new Map<string, { expected: ModelRef; expiresAt: number }>();

export function expectSessionModel(sessionID: string, expected: ModelRef): void {
  expectedSessionModels.set(sessionID, {
    expected,
    expiresAt: Date.now() + EXPECTED_SESSION_MODEL_TTL_MS,
  });
}

export function clearExpectedSessionModel(sessionID: string): void {
  expectedSessionModels.delete(sessionID);
}

export function createProfileSessionListener(
  input: ProfileSessionListenerInput,
): (event: EventSessionUpdated) => void {
  const inFlight = new Set<string>();
  const pending = new Map<
    string,
    Pick<EventSessionUpdated["properties"]["info"], "id" | "agent" | "model" | "metadata">
  >();

  return (event) => {
    void updateProfileMetadata(event.properties.info.id, event.properties.info);
  };

  async function updateProfileMetadata(
    sessionID: string,
    info: Pick<EventSessionUpdated["properties"]["info"], "id" | "agent" | "model" | "metadata">,
  ): Promise<void> {
    if (!info.model?.id) return;
    if (inFlight.has(sessionID)) {
      pending.set(sessionID, info);
      return;
    }

    const current = getProfileMetadata(info.metadata)?.profile;
    const profiles = input.getProfiles();
    const profileID =
      current?.id && profiles?.[current.id] ? current.id : input.getGlobalProfile?.();
    if (!profileID) return;

    const profile = profiles?.[profileID];
    if (!profile) return;

    const agentKey = getAgentKey(info.agent);
    const configuredAgent = agentKey === "$default" ? undefined : profile.models[agentKey];
    const configured = getModelForSession(profile, info.agent);
    const existingOverride = current?.models?.[agentKey];
    const matchesConfigured = isModelEqual(info.model, configured);
    const effectiveOverride = configuredAgent
      ? existingOverride
      : (existingOverride ?? current?.models?.$default);

    const expected = expectedSessionModels.get(sessionID);
    if (expected?.expiresAt && expected.expiresAt <= Date.now()) {
      expectedSessionModels.delete(sessionID);
    } else if (expected && isModelEqual(info.model, expected.expected)) {
      expectedSessionModels.delete(sessionID);
    } else if (expected) {
      return;
    }

    if (matchesConfigured) {
      if (!existingOverride && (!current?.models?.$default || configuredAgent)) return;
    } else if (isModelEqual(info.model, effectiveOverride)) {
      return;
    }

    const models = { ...current?.models };
    if (matchesConfigured && existingOverride) {
      delete models[agentKey];
    } else {
      models[agentKey] = toProfileModel(info.model);
    }

    const nextProfile =
      Object.keys(models).length > 0 ? { id: profileID, models } : { id: profileID };
    const metadata: SessionMetadata = {
      ...info.metadata,
      forge: {
        ...getProfileMetadata(info.metadata),
        profile: nextProfile,
      },
    };

    inFlight.add(sessionID);
    try {
      await input.update(sessionID, metadata);
    } catch {
      // Profile metadata is advisory and must never block session updates.
    } finally {
      inFlight.delete(sessionID);
      const next = pending.get(sessionID);
      if (next) {
        pending.delete(sessionID);
        void updateProfileMetadata(sessionID, next);
      }
    }
  }
}

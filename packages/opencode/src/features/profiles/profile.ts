import type { ModelRef } from "@opencode-ai/sdk/v2";

import { z } from "zod";

import type { SessionMetadata } from "#common/session";

import { getSessionMetadata } from "#common/session";

const ProfileModelSchema = z.object({
  id: z.string(),
  variant: z.string().optional().nullable(),
  provider: z.string().optional(),
});
export type ProfileModel = z.infer<typeof ProfileModelSchema>;

const SessionProfileSchema = z
  .object({
    id: z.string(),
    models: z.record(z.string(), ProfileModelSchema).optional(),
  })
  .nullable()
  .optional();
export type SessionProfile = z.infer<typeof SessionProfileSchema>;

export const Profile = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  models: z.record(z.string(), ProfileModelSchema),
});
export type Profile = z.infer<typeof Profile>;

const ForgeProfileMetadataSchema = z.looseObject({
  profile: SessionProfileSchema,
});
export function getProfileMetadata(metadata: SessionMetadata | undefined) {
  return getSessionMetadata(metadata, "forge", ForgeProfileMetadataSchema);
}

export type ProfileSessionMetadata = { metadata?: SessionMetadata };

type ModelIdentity = {
  id: string;
  provider?: string;
  providerID?: string;
  variant?: string | null;
};

export function isModelEqual(
  left: ModelIdentity | undefined,
  right: ModelIdentity | undefined,
): boolean {
  return (
    left?.id === right?.id &&
    (left?.provider ?? left?.providerID ?? "forge") ===
      (right?.provider ?? right?.providerID ?? "forge") &&
    (left?.variant ?? undefined) === (right?.variant ?? undefined)
  );
}

export function getAgentKey(agent?: string): string {
  return agent && agent !== "$small" ? agent : "$default";
}

export function toProfileModel(model: ModelRef): ProfileModel {
  const profileModel: ProfileModel = { id: model.id };
  if (model.providerID !== "forge") profileModel.provider = model.providerID;
  if (model.variant != null) profileModel.variant = model.variant;
  return profileModel;
}

export function resolveProfileName(
  session: ProfileSessionMetadata | undefined,
  parent: ProfileSessionMetadata | undefined,
  globalProfile: string | undefined,
  profiles: Record<string, Profile> | undefined,
) {
  if (!profiles) return undefined;

  for (const candidate of [
    getProfileMetadata(session?.metadata)?.profile?.id,
    getProfileMetadata(parent?.metadata)?.profile?.id,
    globalProfile,
  ]) {
    if (candidate && profiles[candidate]) return candidate;
  }

  return undefined;
}

export function getModelForSession(
  profile: Profile | undefined,
  agent?: string,
  metadata?: SessionMetadata,
): ModelRef | undefined {
  if (!profile) return undefined;

  const sessionProfile = getProfileMetadata(metadata)?.profile;
  const agentKey = getAgentKey(agent);
  const model =
    sessionProfile?.models?.[agentKey] ??
    profile.models[agentKey] ??
    sessionProfile?.models?.$default ??
    profile.models.$default;
  if (!model?.id) return undefined;

  const result: ModelRef = {
    id: model.id,
    providerID: model.provider ?? "forge",
  };

  if (model.variant != null) result.variant = model.variant;

  return result;
}

export function getExplicitModelForSession(
  profile: Profile | undefined,
  agent?: string,
  metadata?: SessionMetadata,
): ModelRef | undefined {
  if (!profile) return undefined;

  const sessionProfile = getProfileMetadata(metadata)?.profile;
  const agentKey = getAgentKey(agent);
  const model = sessionProfile?.models?.[agentKey] ?? profile.models[agentKey];
  if (!model?.id) return undefined;

  const result: ModelRef = {
    id: model.id,
    providerID: model.provider ?? "forge",
  };

  if (model.variant != null) result.variant = model.variant;

  return result;
}

export function setProfileModel(
  profile: Profile,
  key: string,
  model?: { id: string; provider?: string; variant?: string | null },
) {
  if (!model?.id) {
    delete profile.models[key];
    return;
  }

  const current = profile.models[key];
  if (current?.id === model.id) {
    if (model.provider !== undefined) current.provider = model.provider;
    if ("variant" in model) {
      if (model.variant != null) current.variant = model.variant;
      else delete current.variant;
    }
    return;
  }

  const next: ProfileModel = { id: model.id };
  if (model.provider !== undefined) next.provider = model.provider;
  if (model.variant !== undefined) next.variant = model.variant;
  profile.models[key] = next;
}

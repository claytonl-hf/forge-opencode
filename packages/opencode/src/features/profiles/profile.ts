import { z } from "zod";

export const Profile = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  models: z.record(
    z.string(),
    z.object({
      id: z.string(),
      variant: z.string().optional().nullable(),
    }),
  ),
});
export type Profile = z.infer<typeof Profile>;

export const PROFILE_METADATA_KEY = "forge:profile";

export type SessionMetadata = {
  [PROFILE_METADATA_KEY]?: string;
};

export type ProfileSessionMetadata = {
  metadata?: SessionMetadata;
};

export type ForgeModelRef = {
  id: string;
  providerID: "forge";
  variant?: string;
};

export function resolveProfileName(
  session: ProfileSessionMetadata | undefined,
  parent: ProfileSessionMetadata | undefined,
  globalProfile: string | undefined,
  profiles: Record<string, Profile> | undefined,
) {
  if (!profiles) return undefined;

  for (const candidate of [
    session?.metadata?.[PROFILE_METADATA_KEY],
    parent?.metadata?.[PROFILE_METADATA_KEY],
    globalProfile,
  ]) {
    if (candidate && profiles[candidate]) return candidate;
  }

  return undefined;
}

export function modelForSession(
  profile: Profile | undefined,
  agent?: string,
): ForgeModelRef | undefined {
  if (!profile) return undefined;

  const model = (agent && agent !== "$small" && profile.models[agent]) || profile.models.$default;
  if (!model?.id) return undefined;

  const result: ForgeModelRef = {
    id: model.id,
    providerID: "forge",
  };

  if (model.variant != null) result.variant = model.variant;

  return result;
}

export function setProfileModel(profile: Profile, key: string, id?: string) {
  if (!id) {
    delete profile.models[key];
    return;
  }

  const current = profile.models[key];
  profile.models[key] = current?.id === id ? current : { id };
}

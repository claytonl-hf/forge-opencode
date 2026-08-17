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

export function setProfileModel(profile: Profile, key: string, id?: string) {
  if (!id) {
    delete profile.models[key];
    return;
  }

  const current = profile.models[key];
  profile.models[key] = current?.id === id ? current : { id };
}

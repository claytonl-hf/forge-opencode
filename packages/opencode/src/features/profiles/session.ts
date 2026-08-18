import type { Hooks } from "@opencode-ai/plugin";

import { z } from "zod";

import type { ForgeOptions } from "../../plugin/options";

import {
  modelForSession,
  PROFILE_METADATA_KEY,
  resolveProfileName,
  type ForgeModelRef,
  type Profile,
} from "./profile";

const ProfileSessionSchema = z.object({
  id: z.string(),
  parentID: z.string().optional(),
  agent: z.string().optional(),
  metadata: z
    .object({
      [PROFILE_METADATA_KEY]: z.string().optional(),
    })
    .optional(),
});
type ProfileSession = z.infer<typeof ProfileSessionSchema>;

export type ProfileSessionClient = {
  session: {
    get(input: {
      path: { id: string };
      query: { directory: string };
    }): Promise<{ data?: ProfileSession }>;
  };
};

type ProfileSessionHooksInput = {
  client: ProfileSessionClient;
  directory: string;
  getOptions: () => Pick<ForgeOptions, "profile">;
  getProfiles: () => Record<string, Profile> | undefined;
};

function profileFor(
  input: ProfileSessionHooksInput,
  session: ProfileSession | undefined,
  parent: ProfileSession | undefined,
) {
  const profiles = input.getProfiles();
  const name = resolveProfileName(session, parent, input.getOptions().profile, profiles);
  return name ? { name, profile: profiles?.[name] } : undefined;
}

async function getSession(input: ProfileSessionHooksInput, sessionID: string) {
  try {
    const result = await input.client.session.get({
      path: { id: sessionID },
      query: { directory: input.directory },
    });
    return result.data;
  } catch {
    return undefined;
  }
}

function messageModel(model: ForgeModelRef) {
  if (model.variant === undefined) {
    return { providerID: model.providerID, modelID: model.id };
  }

  return {
    providerID: model.providerID,
    modelID: model.id,
    variant: model.variant,
  };
}

export function createProfileSessionHooks(input: ProfileSessionHooksInput): Hooks {
  return {
    "chat.message": async (messageInput, output) => {
      const session = await getSession(input, messageInput.sessionID);
      const parent = session?.parentID ? await getSession(input, session.parentID) : undefined;
      const profile = profileFor(
        input,
        session ?? { id: messageInput.sessionID, agent: messageInput.agent },
        parent,
      );
      const model = modelForSession(profile?.profile, session?.agent ?? messageInput.agent);
      if (!model) return;

      output.message.model = messageModel(model);
    },
  };
}

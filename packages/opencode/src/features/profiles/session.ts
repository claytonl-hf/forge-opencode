import type { Hooks } from "@opencode-ai/plugin";

import { z } from "zod";

import type { ForgeOptions } from "../../plugin/options";

import {
  modelForSession,
  PROFILE_METADATA_KEY,
  resolveProfileName,
  type ForgeModelRef,
  type Profile,
  type SessionMetadata,
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
    update(input: {
      path: { id: string };
      query: { directory: string };
      body: { metadata: SessionMetadata };
    }): Promise<void>;
    switchModel(input: { sessionID: string; model: ForgeModelRef }): Promise<void>;
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

async function updateMetadata(
  input: ProfileSessionHooksInput,
  sessionID: string,
  metadata: SessionMetadata,
) {
  try {
    await input.client.session.update({
      path: { id: sessionID },
      query: { directory: input.directory },
      body: { metadata },
    });
  } catch {
    // Profile metadata is advisory and must never block a session.
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
    event: async ({ event }) => {
      if (event.type !== "session.created") return;

      const parsed = ProfileSessionSchema.safeParse(event.properties.info);
      if (!parsed.success) return;
      const session = parsed.data;
      const parent = session.parentID ? await getSession(input, session.parentID) : undefined;
      const profile = profileFor(input, session, parent);
      if (!profile?.profile) return;

      const hasProfile = session.metadata?.[PROFILE_METADATA_KEY] !== undefined;
      if (session.parentID && !hasProfile && profile.name) {
        const metadata: SessionMetadata = { [PROFILE_METADATA_KEY]: profile.name };
        await updateMetadata(input, session.id, metadata);
      }

      const model = modelForSession(profile.profile, session.agent);
      if (!model) return;

      try {
        await input.client.session.switchModel({ sessionID: session.id, model });
      } catch {
        // A model switch is best effort; the chat.message hook still applies the profile.
      }
    },
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

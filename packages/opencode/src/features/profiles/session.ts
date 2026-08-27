import type { Hooks } from "@opencode-ai/plugin";
import type { Session as SessionV2 } from "@opencode-ai/sdk/v2";

import { getExplicitModelForSession, resolveProfileName, type Profile } from "./profile";

type ProfileSession = Pick<SessionV2, "id" | "parentID" | "agent" | "metadata">;

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
  getGlobalProfile: () => string | undefined;
  getProfiles: () => Record<string, Profile> | undefined;
};

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

export function createProfileSessionHooks(input: ProfileSessionHooksInput): Hooks {
  return {
    "chat.message": async (messageInput, output) => {
      const session = await getSession(input, messageInput.sessionID);
      const parent = session?.parentID ? await getSession(input, session.parentID) : undefined;
      const profiles = input.getProfiles();
      const name = resolveProfileName(
        session ?? { id: messageInput.sessionID, agent: messageInput.agent },
        parent,
        input.getGlobalProfile(),
        profiles,
      );
      const model = getExplicitModelForSession(
        name ? profiles?.[name] : undefined,
        session?.agent ?? messageInput.agent,
        session?.metadata,
      );
      if (!model) return;

      const messageModel = { providerID: model.providerID, modelID: model.id };
      if (model.variant !== undefined) {
        Object.assign(messageModel, { variant: model.variant });
      }
      output.message.model = messageModel;
    },
  };
}

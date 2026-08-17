import type { Hooks } from "@opencode-ai/plugin";

import type { Integration } from "../../plugin/integrations/types";

const TODO_WRITE_TOOL_ID = "todowrite" as const;

type WorkerSession = { id: string; parentID?: string };

export type WorkerSessionClient = {
  get(parameters: { sessionID: string; directory: string }): Promise<{ data?: WorkerSession }>;
};

export const WORKER_TODO_SYSTEM_INSTRUCTION = [
  "This is a child session. Your first tool call must always be todowrite, before calling any other tool, even for straightforward work.",
  "Create at least one todo to keep your work visible to the parent session. If you need to use tools to determine the scope or breakdown, make that discovery the initial todo item.",
  "After every 5 tool calls, you must call todowrite before using another tool. Use that call to review the current todo list, replace or extend it if the scope changed, and update item statuses.",
  "Once the scope is known, replace the todo list or add the newly identified work. Keep exactly one item in_progress while work remains, update statuses as work changes, and close every item before finishing.",
].join(" ");

export function createWorkerHooks(client: WorkerSessionClient, directory: string): Hooks {
  return {
    config: async (config) => {
      for (const agent of Object.values(config.agent ?? {})) {
        if (!agent || agent.mode === "primary") continue;

        agent.tools = {
          ...agent.tools,
          [TODO_WRITE_TOOL_ID]: true,
        };
        const permission = {
          ...agent.permission,
          [TODO_WRITE_TOOL_ID]: "allow",
        };
        // SAFETY: OpenCode's runtime and V2 config schema support todowrite, but the plugin's
        // legacy Config type used by this hook does not include that built-in permission yet.
        agent.permission = permission as typeof agent.permission;
      }
    },
    "experimental.chat.system.transform": async (input, output) => {
      if (!input.sessionID) return;

      let session: WorkerSession | undefined;
      try {
        session = (
          await client.get({
            sessionID: input.sessionID,
            directory,
          })
        ).data;
      } catch {
        return;
      }
      if (!session?.parentID) return;

      if (!output.system.includes(WORKER_TODO_SYSTEM_INSTRUCTION)) {
        output.system.push(WORKER_TODO_SYSTEM_INSTRUCTION);
      }
    },
  };
}

export const WorkerIntegration: Integration = async (_, options) => ({
  server: async ({ client, directory }) =>
    createWorkerHooks(
      {
        get: ({ sessionID, directory }) =>
          client.session.get({ path: { id: sessionID }, query: { directory } }),
      },
      directory,
    ),
  tui: async (api) => {
    const [{ isComponentEnabled }, { workerSlot }] = await Promise.all([
      import("../../plugin/tui/slots"),
      import("./slot"),
    ]);
    if (!isComponentEnabled(options, "workers")) return {};

    return {
      slots: { sidebar_content: workerSlot(api) },
    };
  },
});

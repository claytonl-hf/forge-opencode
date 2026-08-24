import type { TuiPluginApi } from "@opencode-ai/plugin/tui";

import type { PluginStore } from "#plugin/store";

import {
  dialogMessage,
  dialogTitle,
  getLowTierModels,
  isLowTierModel,
  parseThreshold,
  shouldBlock,
} from "./gate";

type UsageGateClient = TuiPluginApi["client"] & {
  session: TuiPluginApi["client"]["session"] & {
    interrupt?: TuiPluginApi["client"]["v2"]["session"]["interrupt"];
  };
};
type PromptTarget = {
  prompt?: (input: { sessionID: string }, ...options: never[]) => Promise<object>;
};
type SessionModel = { id: string; providerID: string };

async function resolveSessionModel(api: TuiPluginApi, sessionID: string) {
  try {
    const result = await api.client.session.get({ sessionID });
    if (result.data?.model) return result.data.model;
  } catch {
    // A failed HTTP lookup must not disturb the prompt.
  }

  try {
    return api.state.session.get(sessionID)?.model;
  } catch {
    // A missing TUI session must not disturb the prompt.
    return undefined;
  }
}

function modelName(store: Pick<PluginStore, "models">, model: SessionModel): string {
  if (model.providerID !== "forge") return model.id;

  return store.models.getModel(model.id)?.name || model.id;
}

async function sessionChildren(api: TuiPluginApi, sessionID: string) {
  try {
    return await api.client.session.children({ sessionID });
  } catch {
    return undefined;
  }
}

async function interruptBlockedSessions(
  api: TuiPluginApi,
  client: UsageGateClient,
  store: Pick<PluginStore, "models">,
  sessionID: string,
  model: SessionModel | undefined,
  visited = new Set<string>(),
): Promise<void> {
  if (visited.has(sessionID)) return;
  visited.add(sessionID);

  const currentModel = model ?? (await resolveSessionModel(api, sessionID));
  if (
    currentModel?.providerID === "forge" &&
    isLowTierModel(store.models, currentModel.id) === false
  ) {
    try {
      // SAFETY: The runtime TUI client exposes the v1 interrupt compatibility method and v2 fallback.
      if (client.session.interrupt) {
        await client.session.interrupt({ sessionID });
      } else if (client.v2?.session?.interrupt) {
        await client.v2.session.interrupt({ sessionID });
      }
    } catch {
      // A session that has already settled must not disturb the TUI.
    }
  }

  const response = await sessionChildren(api, sessionID);
  if (!response) return;

  await Promise.all(
    (response.data ?? []).map((child) =>
      interruptBlockedSessions(api, client, store, child.id, undefined, visited),
    ),
  );
}

export function startUsageGateDialog(
  api: TuiPluginApi,
  store: Pick<PluginStore, "env" | "usage" | "models">,
): void {
  // SAFETY: The runtime TUI client exposes v1/v2 session prompt and interrupt methods with these shapes.
  const client = api.client as UsageGateClient;
  let disposed = false;
  const pendingDialogTimeouts = new Set<ReturnType<typeof setTimeout>>();

  const scheduleDialog = (modelName: string) => {
    const timeout = setTimeout(() => {
      pendingDialogTimeouts.delete(timeout);
      if (disposed) return;

      try {
        api.ui.dialog.replace(() =>
          api.ui.DialogAlert({
            title: dialogTitle,
            message: dialogMessage(
              modelName,
              getLowTierModels(store.models.get() ?? {}).map((model) => model.name),
            ),
          }),
        );
      } catch {
        // A dialog failure must not disturb the TUI.
      }
    }, 0);
    pendingDialogTimeouts.add(timeout);
  };

  const followUpPrompt = async (
    sessionID: string | undefined,
    rejected: boolean,
  ): Promise<void> => {
    if (!sessionID) return;

    try {
      const usage = await store.usage.refresh();
      const threshold = parseThreshold(store.env.FORGE_USAGE_ALERT_BALANCE);
      if (!usage || !shouldBlock(usage, threshold)) return;

      const model = await resolveSessionModel(api, sessionID);
      await interruptBlockedSessions(api, client, store, sessionID, model);

      if (!rejected || !model) return;
      if (isLowTierModel(store.models, model.id) !== false) return;

      scheduleDialog(modelName(store, model));
    } catch {
      // Usage and session lookup failures must never disturb the TUI.
    }
  };

  const wrapPrompt = (target: PromptTarget | undefined): (() => void) => {
    try {
      const original = target?.prompt;
      if (!original) return () => {};
      const originalPrompt = original;

      function wrapped(this: PromptTarget, ...args: Parameters<typeof originalPrompt>) {
        const result = originalPrompt.apply(this, args);
        const sessionID = args[0]?.sessionID;
        void Promise.resolve(result)
          .then(
            () => followUpPrompt(sessionID, false),
            () => followUpPrompt(sessionID, true),
          )
          .catch(() => {});
        return result;
      }

      target.prompt = wrapped;
      if (target.prompt !== wrapped) return () => {};

      return () => {
        try {
          if (target.prompt === wrapped) target.prompt = originalPrompt;
        } catch {
          // A prompt may become non-writable after registration.
        }
      };
    } catch {
      // A non-writable prompt must not prevent TUI initialization.
      return () => {};
    }
  };

  const restorePrompt = wrapPrompt(client.session);
  const restoreV2Prompt = wrapPrompt(client?.v2?.session);

  api.lifecycle.onDispose(() => {
    disposed = true;
    restorePrompt();
    restoreV2Prompt();
    for (const timeout of pendingDialogTimeouts) clearTimeout(timeout);
    pendingDialogTimeouts.clear();
    if (api.ui.dialog) api.ui.dialog.clear();
  });
}

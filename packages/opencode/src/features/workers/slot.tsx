/** @jsxImportSource @opentui/solid */
import type { TuiPluginApi, TuiSlotContext, TuiSlotPlugin } from "@opencode-ai/plugin/tui";

import { For, Show, createSignal, onCleanup, onMount, type ComponentProps } from "solid-js";

import {
  collectWorkerDescendants,
  deriveWorkerState,
  latestWorkers,
  type WorkerNativeStatus,
  type WorkerSession,
  type WorkerState,
  type WorkerStatus,
  type WorkerTodo,
} from "./model";

type Props = ComponentProps<"box"> &
  TuiSlotContext & {
    api: TuiPluginApi;
    sessionID: string;
  };

type SidebarContent = NonNullable<TuiSlotPlugin["slots"]["sidebar_content"]>;

type NativeSessionStatus = ReturnType<TuiPluginApi["state"]["session"]["status"]>;

function nativeStatus(value: NativeSessionStatus): WorkerNativeStatus | undefined {
  if (!value) return undefined;
  return value.type === "busy" || value.type === "retry" || value.type === "idle"
    ? value.type
    : undefined;
}

function statusColor(theme: Props["theme"], status: WorkerStatus) {
  switch (status) {
    case "done":
    case "inactive":
      return theme.current.textMuted;
    case "working":
      return theme.current.success;
    case "idle":
    case "retrying":
      return theme.current.warning;
  }
}

async function childrenOf(api: TuiPluginApi, sessionID: string): Promise<WorkerSession[]> {
  const response = await api.client.session.children({ sessionID });
  return response.data ?? [];
}

async function todosOf(api: TuiPluginApi, sessionID: string): Promise<WorkerTodo[]> {
  const response = await api.client.session.todo({ sessionID });
  return response.data ?? [];
}

export function workerSlot(api: TuiPluginApi): SidebarContent {
  return (ctx, props) => <Workers api={api} theme={ctx.theme} sessionID={props.session_id} />;
}

function Workers({ api, theme, sessionID, ...props }: Props) {
  const [entries, setEntries] = createSignal<WorkerState[]>([]);
  const [expanded, setExpanded] = createSignal(true);
  const [blinkVisible, setBlinkVisible] = createSignal(true);
  const sessions = new Map<string, WorkerSession>();
  const todos = new Map<string, WorkerTodo[]>();
  const todoVersions = new Map<string, number>();
  const statuses = new Map<string, WorkerNativeStatus>();
  const observedAt = new Map<string, number>();
  const descendantIDs = new Set<string>();
  let disposed = false;
  let loaded = false;
  let loadGeneration = 0;
  let blinkTimer: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: Array<() => void> = [];

  function rebuildEntry(id: string) {
    const session = sessions.get(id);
    if (!session) return;

    const entry = deriveWorkerState(
      session,
      todos.get(id) ?? [],
      statuses.get(id),
      observedAt.get(id),
    );
    setEntries((current) => {
      const remaining = current.filter((currentEntry) => currentEntry.session.id !== id);
      return latestWorkers([...remaining, entry]);
    });
  }

  async function refresh() {
    if (disposed) return;
    const generation = ++loadGeneration;
    const todoVersionsBeforeLoad = new Map(todoVersions);

    try {
      const descendants = await collectWorkerDescendants(sessionID, (parentID) =>
        childrenOf(api, parentID),
      );
      if (disposed || generation !== loadGeneration) return;

      loaded = true;
      descendantIDs.clear();
      sessions.clear();
      for (const session of descendants) {
        descendantIDs.add(session.id);
        sessions.set(session.id, session);
        const status = nativeStatus(api.state.session.status(session.id));
        if (status) statuses.set(session.id, status);
      }

      const loadedTodos = await Promise.all(
        descendants.map(async (session) => [session.id, await todosOf(api, session.id)] as const),
      );
      if (disposed || generation !== loadGeneration) return;

      for (const id of statuses.keys()) {
        if (!descendantIDs.has(id)) statuses.delete(id);
      }
      for (const id of observedAt.keys()) {
        if (!descendantIDs.has(id)) observedAt.delete(id);
      }
      for (const id of todos.keys()) {
        if (!descendantIDs.has(id)) todos.delete(id);
      }
      for (const id of todoVersions.keys()) {
        if (!descendantIDs.has(id)) todoVersions.delete(id);
      }
      for (const [id, items] of loadedTodos) {
        if (todoVersions.get(id) === todoVersionsBeforeLoad.get(id)) todos.set(id, items);
      }

      const next = descendants.map((session) =>
        deriveWorkerState(
          session,
          todos.get(session.id) ?? [],
          statuses.get(session.id),
          observedAt.get(session.id),
        ),
      );
      setEntries(latestWorkers(next));
    } catch {
      // Keep the last event-driven view when a transient session request fails.
    }
  }

  function handleDeleted(id: string) {
    if (!descendantIDs.has(id)) return;
    descendantIDs.delete(id);
    sessions.delete(id);
    todos.delete(id);
    todoVersions.delete(id);
    statuses.delete(id);
    observedAt.delete(id);
    setEntries((current) => current.filter((entry) => entry.session.id !== id));
    void refresh();
  }

  onMount(() => {
    blinkTimer = setInterval(() => {
      if (entries().some((entry) => entry.status === "working")) {
        setBlinkVisible((visible) => !visible);
      } else {
        setBlinkVisible(true);
      }
    }, 600);
    unsubscribe = [
      api.event.on("session.created", (event) => {
        const parentID = event.properties.info.parentID;
        if (!loaded || parentID === sessionID || (parentID && descendantIDs.has(parentID))) {
          void refresh();
        }
      }),
      api.event.on("session.updated", (event) => {
        const updated = event.properties.info;
        if (descendantIDs.has(updated.id)) {
          sessions.set(updated.id, updated);
          rebuildEntry(updated.id);
          return;
        }

        const parentID = updated.parentID;
        if (!loaded || parentID === sessionID || (parentID && descendantIDs.has(parentID))) {
          void refresh();
        }
      }),
      api.event.on("session.deleted", (event) => handleDeleted(event.properties.sessionID)),
      api.event.on("todo.updated", (event) => {
        const { sessionID: id, todos: nextTodos } = event.properties;
        if (!descendantIDs.has(id)) return;
        todos.set(id, nextTodos);
        todoVersions.set(id, (todoVersions.get(id) ?? 0) + 1);
        observedAt.set(id, Date.now());
        rebuildEntry(id);
      }),
      api.event.on("session.status", (event) => {
        const id = event.properties.sessionID;
        const status = nativeStatus(event.properties.status);
        if (!status || !descendantIDs.has(id)) return;
        statuses.set(id, status);
        observedAt.set(id, Date.now());
        rebuildEntry(id);
      }),
    ];
    void refresh();
  });

  onCleanup(() => {
    disposed = true;
    if (blinkTimer) clearInterval(blinkTimer);
    for (const dispose of unsubscribe) dispose();
    unsubscribe = [];
  });

  return (
    <box
      flexDirection="column"
      height={entries().length > 0 ? "auto" : 0}
      overflow="hidden"
      {...props}
    >
      <Show when={entries().length > 0}>
        <text
          onMouseUp={() => setExpanded((current) => !current)}
          style={{ fg: theme.current.text }}
        >
          <span>{expanded() ? "▼" : "▶"} </span>
          <b>Workers</b>
        </text>
        <Show when={expanded()}>
          <For each={entries()}>
            {(entry) => {
              const [hovered, setHovered] = createSignal(false);
              const muted = () => entry.status === "done" || entry.status === "inactive";

              return (
                <box
                  flexDirection="column"
                  onMouseUp={() => api.route.navigate("session", { sessionID: entry.session.id })}
                >
                  <text
                    onMouseOut={() => setHovered(false)}
                    onMouseOver={() => setHovered(true)}
                    truncate
                    wrapMode="none"
                    style={{ fg: muted() ? theme.current.textMuted : theme.current.text }}
                  >
                    <span style={{ fg: statusColor(theme, entry.status) }}>
                      {entry.status !== "working" || blinkVisible() ? "• " : "  "}
                    </span>
                    <Show when={hovered()} fallback={<span>{entry.goal}</span>}>
                      <span style={{ underline: true }}>{entry.goal}</span>
                    </Show>
                  </text>
                  <Show when={entry.status !== "done" && entry.status !== "inactive"}>
                    <box paddingLeft={2}>
                      <text truncate wrapMode="none" style={{ fg: theme.current.textMuted }}>
                        {entry.progress}
                      </text>
                    </box>
                  </Show>
                </box>
              );
            }}
          </For>
        </Show>
      </Show>
    </box>
  );
}

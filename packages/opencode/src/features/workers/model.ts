export type WorkerNativeStatus = "busy" | "retry" | "idle";
export type WorkerStatus = "working" | "retrying" | "idle" | "inactive" | "done";

export type WorkerTodo = {
  content: string;
  status: string;
};

export type WorkerSession = {
  id: string;
  parentID?: string;
  title?: string;
  agent?: string;
  time?: { updated?: number };
};

export type WorkerState<Session extends WorkerSession = WorkerSession> = {
  session: Session;
  goal: string;
  progress: string;
  status: WorkerStatus;
  updatedAt: number;
};

type WorkerProgress = Pick<WorkerState, "status" | "progress">;

function displaySessionTitle(session: WorkerSession) {
  const title = session.title?.trim() || "Untitled session";
  return title.replace(/\s+\(@[^()]+ subagent\)$/, "");
}

export function deriveWorkerState<Session extends WorkerSession>(
  session: Session,
  todos: ReadonlyArray<WorkerTodo>,
  nativeStatus?: WorkerNativeStatus,
  observedAt?: number,
): WorkerState<Session> {
  const sessionTitle = displaySessionTitle(session);
  const active = todos.find((todo) => todo.status === "in_progress");
  const pending = todos.find((todo) => todo.status === "pending");
  const closedCount = todos.filter(
    (todo) => todo.status === "completed" || todo.status === "cancelled",
  ).length;
  const allClosed =
    todos.length > 0 &&
    todos.every((todo) => todo.status === "completed" || todo.status === "cancelled");

  const { status, progress } = ((): WorkerProgress => {
    if (nativeStatus === "busy") {
      return { status: "working", progress: active?.content ?? pending?.content ?? "Working…" };
    }
    if (nativeStatus === "retry") {
      return { status: "retrying", progress: active?.content ?? pending?.content ?? "Retrying…" };
    }
    if (allClosed) {
      return { status: "done", progress: "Done" };
    }
    if (todos.length > 0) {
      return { status: "idle", progress: active?.content ?? pending?.content ?? "Work unfinished" };
    }
    return { status: "inactive", progress: sessionTitle };
  })();

  return {
    session,
    goal:
      status === "inactive" || todos.length > 0 ? sessionTitle : session.agent?.trim() || "Worker",
    progress: todos.length > 0 ? `[${closedCount}/${todos.length}] ${progress}` : sessionTitle,
    status,
    updatedAt: observedAt ?? session.time?.updated ?? 0,
  };
}

export async function collectWorkerDescendants<Session extends WorkerSession>(
  rootSessionID: string,
  childrenOf: (sessionID: string) => Promise<Session[]>,
): Promise<Session[]> {
  const descendants: Session[] = [];
  const visited = new Set([rootSessionID]);
  let parents = [rootSessionID];

  while (parents.length > 0) {
    const next: string[] = [];
    const levels = await Promise.all(parents.map(childrenOf));
    for (const children of levels) {
      for (const child of children) {
        if (visited.has(child.id)) continue;
        visited.add(child.id);
        descendants.push(child);
        next.push(child.id);
      }
    }
    parents = next;
  }

  return descendants;
}

export function latestWorkers<Session extends WorkerSession>(
  entries: WorkerState<Session>[],
  limit = 5,
): WorkerState<Session>[] {
  return entries
    .toSorted(
      (left, right) =>
        right.updatedAt - left.updatedAt || left.session.id.localeCompare(right.session.id),
    )
    .slice(0, limit);
}

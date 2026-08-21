import { describe, expect, test } from "vitest";

import {
  collectWorkerDescendants,
  deriveWorkerState,
  latestWorkers,
} from "#features/workers/model";

const session = {
  id: "child",
  title: "Build native worker view",
  agent: "explore",
  time: { updated: 123 },
};

describe("worker model", () => {
  test("collects recursive descendants without including the viewed session", async () => {
    const children = new Map([
      ["root", [{ id: "first" }, { id: "second" }]],
      ["first", [{ id: "grandchild" }]],
      ["second", [{ id: "root" }]],
    ]);

    const descendants = await collectWorkerDescendants(
      "root",
      async (sessionID) => children.get(sessionID) ?? [],
    );

    expect(descendants.map((item) => item.id)).toEqual(["first", "second", "grandchild"]);
  });

  test("derives goal, active progress, and working status", () => {
    expect(
      deriveWorkerState(
        session,
        [
          { content: "Inspect current code", status: "completed" },
          { content: "Implement todo view", status: "in_progress" },
        ],
        "busy",
      ),
    ).toEqual({
      session,
      goal: "Build native worker view",
      progress: "[1/2] Implement todo view",
      status: "working",
      updatedAt: 123,
    });
  });

  test("marks an idle worker done only when it has todos and all are closed", () => {
    expect(
      deriveWorkerState(
        session,
        [
          { content: "Implement", status: "completed" },
          { content: "Old approach", status: "cancelled" },
        ],
        "idle",
      )?.status,
    ).toBe("done");
    expect(deriveWorkerState(session, [], "idle")).toMatchObject({
      goal: "Build native worker view",
      progress: "Build native worker view",
      status: "inactive",
    });
  });

  test("keeps idle unfinished and retrying states distinct", () => {
    const todos = [{ content: "Run verification", status: "pending" }];
    expect(deriveWorkerState(session, todos, "idle")).toMatchObject({
      progress: "[0/1] Run verification",
      status: "idle",
    });
    expect(deriveWorkerState(session, todos, "retry")).toMatchObject({
      progress: "[0/1] Run verification",
      status: "retrying",
    });
  });

  test("uses agent and session names before the first todowrite call", () => {
    expect(deriveWorkerState(session, [], "busy")).toMatchObject({
      goal: "explore",
      progress: "Build native worker view",
      status: "working",
    });
  });

  test("removes OpenCode's subagent suffix from displayed session titles", () => {
    const suffixed = {
      ...session,
      title: "Inspect worker state (@review subagent)",
      agent: "review",
    };

    expect(
      deriveWorkerState(suffixed, [{ content: "Inspect todos", status: "in_progress" }], "busy"),
    ).toMatchObject({
      goal: "Inspect worker state",
      progress: "[0/1] Inspect todos",
    });
    expect(deriveWorkerState(suffixed, [], "idle")).toMatchObject({
      goal: "Inspect worker state",
      progress: "Inspect worker state",
    });
  });

  test("keeps an existing idle worker without todos neutral", () => {
    expect(deriveWorkerState(session, [], "idle")).toMatchObject({
      goal: "Build native worker view",
      progress: "Build native worker view",
      status: "inactive",
    });
  });

  test("keeps only the five most recently observed workers", () => {
    const entries = Array.from({ length: 7 }, (_, index) => ({
      session: { id: `session-${index}` },
      goal: "Goal",
      progress: "Progress",
      status: "working" as const,
      updatedAt: index,
    }));

    expect(latestWorkers(entries).map((entry) => entry.updatedAt)).toEqual([6, 5, 4, 3, 2]);
  });
});

import type { Config } from "@opencode-ai/plugin";

import { describe, expect, mock, test } from "bun:test";

import {
  createWorkerHooks,
  type WorkerSessionClient,
  WORKER_TODO_SYSTEM_INSTRUCTION,
} from "../../../src/features/workers/integration";

function integrationHooks(client: WorkerSessionClient) {
  return createWorkerHooks(client, "/worktree");
}

type MutableSession = { id: string; parentID?: string };
type SystemOutput = { system: string[] };

function sessionClient(resolve: (sessionID: string) => MutableSession | undefined) {
  return {
    get: mock(async ({ sessionID }: { sessionID: string }) => ({ data: resolve(sessionID) })),
  };
}

describe("native todo worker integration", () => {
  test("enables todowrite for subagent-capable agents without changing primary agents", async () => {
    const hooks = integrationHooks(sessionClient(() => undefined));
    const config: Config = {
      agent: {
        lead: { mode: "primary" as const, tools: { read: true } },
        explore: {
          mode: "subagent" as const,
          tools: { read: true, todowrite: false },
          permission: { bash: "deny" },
        },
        shared: { mode: "all" as const, tools: { grep: true }, permission: { edit: "ask" } },
      },
    };

    await hooks.config!(config);

    expect(config.agent?.lead?.tools).toEqual({ read: true });
    expect(config.agent?.lead?.permission).toBeUndefined();
    expect(config.agent?.explore?.tools).toEqual({ read: true, todowrite: true });
    expect(config.agent?.explore?.permission).toMatchObject({ bash: "deny", todowrite: "allow" });
    expect(config.agent?.shared?.tools).toEqual({ grep: true, todowrite: true });
    expect(config.agent?.shared?.permission).toMatchObject({ edit: "ask", todowrite: "allow" });
    expect(hooks.tool).toBeUndefined();
  });

  test("adds todo instructions after a new child session receives its parent", async () => {
    const child: MutableSession = { id: "child" };
    const hooks = integrationHooks(sessionClient(() => child));
    const hook = hooks["experimental.chat.system.transform"]!;

    const beforeParent: SystemOutput = { system: [] };
    // SAFETY: the hook only reads sessionID; model is required by the external hook contract.
    await hook({ sessionID: "child", model: {} as never }, beforeParent);
    expect(beforeParent.system).toEqual([]);

    child.parentID = "root";
    const afterParent: SystemOutput = { system: [] };
    // SAFETY: the hook only reads sessionID; model is required by the external hook contract.
    await hook({ sessionID: "child", model: {} as never }, afterParent);
    expect(afterParent.system).toEqual([WORKER_TODO_SYSTEM_INSTRUCTION]);
  });

  test("adds instructions only to child sessions and requires todowrite first", async () => {
    const sessions = new Map([
      ["root", { id: "root" }],
      ["child", { id: "child", parentID: "root" }],
    ]);
    const hooks = integrationHooks(sessionClient((sessionID) => sessions.get(sessionID)));
    const hook = hooks["experimental.chat.system.transform"]!;

    const rootOutput: SystemOutput = { system: [] };
    // SAFETY: the hook only reads sessionID; model is required by the external hook contract.
    await hook({ sessionID: "root", model: {} as never }, rootOutput);
    expect(rootOutput.system).toEqual([]);

    const childOutput: SystemOutput = { system: [] };
    // SAFETY: the hook only reads sessionID; model is required by the external hook contract.
    await hook({ sessionID: "child", model: {} as never }, childOutput);
    expect(childOutput.system).toEqual([WORKER_TODO_SYSTEM_INSTRUCTION]);
    expect(WORKER_TODO_SYSTEM_INSTRUCTION).toContain("first tool call must always be todowrite");
    expect(WORKER_TODO_SYSTEM_INSTRUCTION).toContain("before calling any other tool");
    expect(WORKER_TODO_SYSTEM_INSTRUCTION).toContain("at least one todo");
    expect(WORKER_TODO_SYSTEM_INSTRUCTION).toContain("discovery the initial todo item");
    expect(WORKER_TODO_SYSTEM_INSTRUCTION).toContain("replace the todo list or add");
    expect(WORKER_TODO_SYSTEM_INSTRUCTION).toContain("After every 5 tool calls");
    expect(WORKER_TODO_SYSTEM_INSTRUCTION).toContain("call todowrite before using another tool");
    expect(WORKER_TODO_SYSTEM_INSTRUCTION).toContain("exactly one item in_progress");
    expect(WORKER_TODO_SYSTEM_INSTRUCTION).not.toContain("todoread");
  });
});

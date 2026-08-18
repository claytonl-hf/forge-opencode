import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import type { Session } from "@opencode-ai/sdk";

import { describe, expect, test } from "bun:test";

import { ProfileCommand } from "../../../src/features/profiles/command";
import {
  DesktopProfile,
  filterOptions,
  resolveProfileSelection,
  serializeProfileSelection,
} from "../../../src/features/profiles/picker";
import {
  modelForSession,
  PROFILE_METADATA_KEY,
  Profile,
  resolveProfileName,
  setProfileModel,
  type SessionMetadata,
} from "../../../src/features/profiles/profile";
import {
  createProfileSessionHooks,
  type ProfileSessionClient,
} from "../../../src/features/profiles/session";
import { ForgeOptions, type UseForgeOptions } from "../../../src/plugin/options";

type ProfileSessionRecord = Session & {
  agent?: string;
  metadata?: SessionMetadata;
};
type SessionUpdateInput = Parameters<ProfileSessionClient["session"]["update"]>[0];
type SessionSwitchModelInput = Parameters<ProfileSessionClient["session"]["switchModel"]>[0];
type ProfileChatMessage = NonNullable<ReturnType<typeof createProfileSessionHooks>["chat.message"]>;
type ProfileChatMessageInput = Parameters<ProfileChatMessage>[0];
type ProfileChatMessageOutput = Parameters<ProfileChatMessage>[1];
type ProfileEventInput = Parameters<
  NonNullable<ReturnType<typeof createProfileSessionHooks>["event"]>
>[0];

describe("filterOptions", () => {
  test("matches profile titles and descriptions", () => {
    const options = [
      { title: "Pareto", value: "pareto", description: "Best intelligence for the cost" },
      { title: "Lite", value: "lite", description: "Cost-efficient models" },
    ];

    expect(filterOptions(options, "intelligence")).toEqual([options[0]!]);
    expect(filterOptions(options, "LITE")).toEqual([options[1]!]);
  });

  test("does not expose a stale option when a search has no results", () => {
    const options = [{ title: "Lite", value: "lite" }];

    expect(filterOptions(options, "missing")).toEqual([]);
  });
});

describe("profile selection", () => {
  const profiles = { lite: Profile.parse({ models: {} }) };

  test("normalizes missing profiles to none", () => {
    expect(resolveProfileSelection("missing", profiles)).toBeNull();
  });

  test("uses a distinct internal value for Forge Desktop", () => {
    expect(resolveProfileSelection("default", profiles)).toBe(DesktopProfile);
    expect(serializeProfileSelection(DesktopProfile)).toBe("default");
  });
});

describe("setProfileModel", () => {
  test("removes not-set mappings from the persisted profile", () => {
    const profile = Profile.parse({ models: { lead: { id: "old", variant: "high" } } });

    setProfileModel(profile, "lead");

    expect(Object.keys(profile.models)).toEqual([]);
  });

  test("preserves a variant for the same model and clears it for a new model", () => {
    const profile = Profile.parse({ models: { lead: { id: "old", variant: "high" } } });

    setProfileModel(profile, "lead", "old");
    expect(profile.models.lead).toEqual({ id: "old", variant: "high" });

    setProfileModel(profile, "lead", "new");
    expect(profile.models.lead).toEqual({ id: "new" });
  });
});

describe("profile session helpers", () => {
  const profiles = {
    balanced: Profile.parse({
      models: {
        $default: { id: "default", variant: "medium" },
        reviewer: { id: "reviewer", variant: "high" },
      },
    }),
  };

  test("resolves session metadata before parent metadata and global options", () => {
    expect(
      resolveProfileName(
        { metadata: { [PROFILE_METADATA_KEY]: "balanced" } },
        { metadata: { [PROFILE_METADATA_KEY]: "missing" } },
        "missing",
        profiles,
      ),
    ).toBe("balanced");
    expect(
      resolveProfileName(
        undefined,
        { metadata: { [PROFILE_METADATA_KEY]: "balanced" } },
        "missing",
        profiles,
      ),
    ).toBe("balanced");
  });

  test("ignores unknown and missing profiles without throwing", () => {
    expect(() => resolveProfileName(undefined, undefined, "missing", undefined)).not.toThrow();
    expect(resolveProfileName(undefined, undefined, "missing", profiles)).toBeUndefined();
  });

  test("prefers an agent mapping and falls back to the default mapping", () => {
    expect(modelForSession(profiles.balanced, "reviewer")).toEqual({
      id: "reviewer",
      providerID: "forge",
      variant: "high",
    });
    expect(modelForSession(profiles.balanced, "missing")).toEqual({
      id: "default",
      providerID: "forge",
      variant: "medium",
    });
    expect(modelForSession(Profile.parse({ models: {} }), "reviewer")).toBeUndefined();
  });
});

describe("profile session hooks", () => {
  test("inherits a parent profile on session.created and switches the agent model", async () => {
    const sessions = {
      parent: {
        id: "parent",
        projectID: "project",
        directory: "/tmp",
        title: "Parent",
        version: "1",
        time: { created: 1, updated: 1 },
        metadata: { [PROFILE_METADATA_KEY]: "balanced" },
      },
      child: {
        id: "child",
        projectID: "project",
        directory: "/tmp",
        title: "Child",
        version: "1",
        time: { created: 1, updated: 1 },
        parentID: "parent",
        agent: "reviewer",
        metadata: {},
      },
    } satisfies Record<"parent" | "child", ProfileSessionRecord>;
    const sessionFor = (id: string) => (id === "parent" ? sessions.parent : sessions.child);
    const updates: SessionUpdateInput[] = [];
    const switches: SessionSwitchModelInput[] = [];
    const client: ProfileSessionClient = {
      session: {
        get: async ({ path }: Parameters<ProfileSessionClient["session"]["get"]>[0]) => ({
          data: sessionFor(path.id),
        }),
        update: async (input: SessionUpdateInput) => {
          updates.push(input);
        },
        switchModel: async (input: SessionSwitchModelInput) => {
          switches.push(input);
        },
      },
    };
    const hooks = createProfileSessionHooks({
      client,
      directory: "/tmp",
      getOptions: () => ({ profile: undefined }),
      getProfiles: () => ({
        balanced: Profile.parse({
          models: {
            reviewer: { id: "reviewer", variant: "high" },
          },
        }),
      }),
    });

    const event: ProfileEventInput = {
      event: {
        type: "session.created",
        properties: { info: sessions.child },
      },
    };
    await hooks.event?.(event);

    expect(updates).toEqual([
      {
        path: { id: "child" },
        query: { directory: "/tmp" },
        body: { metadata: { [PROFILE_METADATA_KEY]: "balanced" } },
      },
    ]);
    expect(switches).toEqual([
      {
        sessionID: "child",
        model: { id: "reviewer", providerID: "forge", variant: "high" },
      },
    ]);
  });

  test("forces chat.message output.model without changing input.model", async () => {
    const inputModel: NonNullable<ProfileChatMessageInput["model"]> = {
      providerID: "old",
      modelID: "old",
    };
    const client: ProfileSessionClient = {
      session: {
        get: async () => ({
          data: {
            id: "session",
            agent: "reviewer",
            metadata: { [PROFILE_METADATA_KEY]: "balanced" },
          },
        }),
        update: async () => {},
        switchModel: async () => {},
      },
    };
    const hooks = createProfileSessionHooks({
      client,
      directory: "/tmp",
      getOptions: () => ({}),
      getProfiles: () => ({
        balanced: Profile.parse({
          models: { reviewer: { id: "reviewer", variant: "high" } },
        }),
      }),
    });
    const input: ProfileChatMessageInput = {
      sessionID: "session",
      agent: "reviewer",
      model: inputModel,
    };
    const output: ProfileChatMessageOutput = {
      message: {
        id: "message",
        sessionID: "session",
        role: "user",
        time: { created: 1 },
        agent: "reviewer",
        model: inputModel,
      },
      parts: [],
    };

    await hooks["chat.message"]?.(input, output);

    expect(input.model).toBe(inputModel);
    expect(output.message.model).toEqual({
      providerID: "forge",
      modelID: "reviewer",
      variant: "high",
    });
  });
});

describe("ProfileCommand", () => {
  test("does not install a command-level interceptor for the opening key", () => {
    let intercepts = 0;
    let updates = 0;
    // SAFETY: this focused TUI fake implements every member ProfileCommand exercises.
    const api = Object.assign({} as TuiPluginApi, {
      state: { config: {}, provider: [] },
      keymap: {
        intercept: () => {
          intercepts += 1;
          return () => {};
        },
      },
      lifecycle: { onDispose: () => {} },
      ui: {
        dialog: { clear: () => {}, replace: () => {}, setSize: () => {} },
        toast: () => {},
      },
    });
    // SAFETY: this focused options fake implements every member ProfileCommand exercises.
    const options = {
      value: ForgeOptions.parse({
        profile: "lite",
        profiles: { lite: { name: "Lite", models: {} } },
      }),
      update: () => {
        updates += 1;
        return ForgeOptions.parse({});
      },
    } as UseForgeOptions;
    const command = ProfileCommand(api, options);

    // SAFETY: ProfileCommand does not inspect its invocation argument.
    command.run({} as never);

    expect(intercepts).toBe(0);
    expect(updates).toBe(0);
  });
});

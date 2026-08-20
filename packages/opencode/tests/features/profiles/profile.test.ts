import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import type { Session } from "@opencode-ai/sdk";

import { describe, expect, test } from "bun:test";

import {
  ProfileCommand,
  saveEditedProfile,
  saveProfile,
} from "../../../src/features/profiles/command";
import {
  applyPendingProfile,
  clearPendingProfile,
  onTuiSessionCreated,
  peekPendingProfile,
  subscribePendingProfile,
  takePendingProfile,
  writePendingProfile,
} from "../../../src/features/profiles/pending";
import {
  DesktopProfile,
  filterOptions,
  resolveProfileSelection,
  serializeProfileSelection,
  visibleHomeProfileTitle,
  visibleProfileTitle,
} from "../../../src/features/profiles/picker";
import {
  modelForSession,
  PROFILE_METADATA_KEY,
  Profile,
  resolveProfileName,
  setProfileModel,
  type ForgeModelRef,
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
type SessionSwitchModelInput = { sessionID: string; model: ForgeModelRef };
type CommandSessionUpdateInput = { sessionID: string; metadata: SessionMetadata };
type ProfileChatMessage = NonNullable<ReturnType<typeof createProfileSessionHooks>["chat.message"]>;
type ProfileChatMessageInput = Parameters<ProfileChatMessage>[0];
type ProfileChatMessageOutput = Parameters<ProfileChatMessage>[1];

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
      name: "Balanced",
      models: {
        $default: { id: "default", variant: "medium" },
        reviewer: { id: "reviewer", variant: "high" },
      },
    }),
    parent: Profile.parse({ name: "Parent", models: {} }),
    global: Profile.parse({ models: {} }),
    default: Profile.parse({ name: "Hidden default", models: {} }),
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

  test("resolves visible titles from session, parent, and global profiles", () => {
    expect(
      visibleProfileTitle(
        { metadata: { [PROFILE_METADATA_KEY]: "balanced" } },
        { metadata: { [PROFILE_METADATA_KEY]: "parent" } },
        "global",
        profiles,
      ),
    ).toBe("Balanced");
    expect(
      visibleProfileTitle(
        undefined,
        { metadata: { [PROFILE_METADATA_KEY]: "parent" } },
        "global",
        profiles,
      ),
    ).toBe("Parent");
    expect(visibleProfileTitle(undefined, undefined, "global", profiles)).toBe("global");
  });

  test("prefers a pending home profile title over the global profile", () => {
    expect(visibleHomeProfileTitle("balanced", "global", profiles)).toBe("Balanced");
    expect(visibleHomeProfileTitle(undefined, "global", profiles)).toBe("global");
    expect(visibleHomeProfileTitle(null, "global", profiles)).toBe("global");
  });

  test("hides missing, unknown, and Desktop Default selections", () => {
    expect(visibleProfileTitle(undefined, undefined, undefined, profiles)).toBeUndefined();
    expect(visibleProfileTitle(undefined, undefined, "missing", profiles)).toBeUndefined();
    expect(visibleProfileTitle(undefined, undefined, "default", profiles)).toBeUndefined();
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

describe("pending profile subscriptions", () => {
  test("notifies subscribers when pending state changes and stops after unsubscribe", () => {
    clearPendingProfile();
    const values: Array<string | null | undefined> = [];
    const unsubscribe = subscribePendingProfile((value) => values.push(value));

    try {
      writePendingProfile("balanced");
      clearPendingProfile();
      writePendingProfile("pending");
      expect(takePendingProfile()).toBe("pending");

      expect(values).toEqual(["balanced", undefined, "pending", undefined]);

      unsubscribe();
      writePendingProfile("ignored");
      expect(values).toEqual(["balanced", undefined, "pending", undefined]);
    } finally {
      unsubscribe();
      clearPendingProfile();
    }
  });
});

describe("profile session hooks", () => {
  test("inherits a parent profile through the TUI and leaves pending untouched", async () => {
    clearPendingProfile();
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
    const updates: Array<{ sessionID: string; metadata: SessionMetadata }> = [];
    const switches: SessionSwitchModelInput[] = [];
    try {
      writePendingProfile("pending");
      await onTuiSessionCreated({
        sessionID: sessions.child.id,
        parentID: sessions.child.parentID,
        agent: sessions.child.agent,
        metadata: sessions.child.metadata,
        profiles: {
          balanced: Profile.parse({
            models: {
              reviewer: { id: "reviewer", variant: "high" },
            },
          }),
        },
        getParent: async (parentID) => (parentID === "parent" ? sessions.parent : undefined),
        update: async (sessionID, metadata) => {
          updates.push({ sessionID, metadata });
        },
        switchModel: async (sessionID, model) => {
          switches.push({ sessionID, model });
        },
      });

      expect(updates).toEqual([
        {
          sessionID: "child",
          metadata: { [PROFILE_METADATA_KEY]: "balanced" },
        },
      ]);
      expect(switches).toEqual([
        {
          sessionID: "child",
          model: { id: "reviewer", providerID: "forge", variant: "high" },
        },
      ]);
      expect(peekPendingProfile()).toBe("pending");
    } finally {
      clearPendingProfile();
    }
  });

  test("applies a pending profile to a top-level session and consumes it", async () => {
    clearPendingProfile();
    try {
      writePendingProfile("balanced");
      const updates: Array<{ sessionID: string; metadata: SessionMetadata }> = [];
      const switches: SessionSwitchModelInput[] = [];
      await applyPendingProfile({
        sessionID: "top-level",
        agent: "reviewer",
        profiles: {
          balanced: Profile.parse({
            models: { reviewer: { id: "reviewer", variant: "high" } },
          }),
        },
        update: async (sessionID, metadata) => {
          updates.push({ sessionID, metadata });
        },
        switchModel: async (sessionID, model) => {
          switches.push({ sessionID, model });
        },
      });

      expect(updates).toEqual([
        {
          sessionID: "top-level",
          metadata: { [PROFILE_METADATA_KEY]: "balanced" },
        },
      ]);
      expect(switches).toEqual([
        {
          sessionID: "top-level",
          model: { id: "reviewer", providerID: "forge", variant: "high" },
        },
      ]);
      expect(peekPendingProfile()).toBeUndefined();
    } finally {
      clearPendingProfile();
    }
  });

  test("leaves pending profile for child sessions", async () => {
    clearPendingProfile();
    try {
      writePendingProfile("balanced");
      const updates: Array<{ sessionID: string; metadata: SessionMetadata }> = [];
      await applyPendingProfile({
        sessionID: "child",
        parentID: "parent",
        profiles: {
          balanced: Profile.parse({
            models: { reviewer: { id: "reviewer", variant: "high" } },
          }),
        },
        update: async (sessionID, metadata) => {
          updates.push({ sessionID, metadata });
        },
        switchModel: async () => {
          throw new Error("child sessions must not switch from pending state");
        },
      });

      expect(updates).toHaveLength(0);
      expect(peekPendingProfile()).toBe("balanced");
    } finally {
      clearPendingProfile();
    }
  });

  test("restores a pending profile when applying its metadata fails", async () => {
    clearPendingProfile();
    try {
      writePendingProfile("balanced");
      await applyPendingProfile({
        sessionID: "top-level",
        profiles: { balanced: Profile.parse({ models: {} }) },
        update: async () => {
          throw new Error("metadata update failed");
        },
        switchModel: async () => {},
      });

      expect(peekPendingProfile()).toBe("balanced");
    } finally {
      clearPendingProfile();
    }
  });

  test("consumes a pending profile when switching its model fails", async () => {
    clearPendingProfile();
    try {
      writePendingProfile("balanced");
      await applyPendingProfile({
        sessionID: "top-level",
        agent: "reviewer",
        profiles: {
          balanced: Profile.parse({
            models: { reviewer: { id: "reviewer", variant: "high" } },
          }),
        },
        update: async () => {},
        switchModel: async () => {
          throw new Error("model switch failed");
        },
      });

      expect(peekPendingProfile()).toBeUndefined();
    } finally {
      clearPendingProfile();
    }
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
  test("saves a named profile to this session without changing the global profile", async () => {
    const profiles = {
      balanced: Profile.parse({
        models: {
          $default: { id: "default", variant: "medium" },
          reviewer: { id: "reviewer", variant: "high" },
        },
      }),
    };
    const options = createTestOptions(ForgeOptions.parse({ profile: "existing", profiles }));
    const sessionUpdates: CommandSessionUpdateInput[] = [];
    const switches: SessionSwitchModelInput[] = [];
    const session: ProfileSessionRecord = {
      id: "session",
      projectID: "project",
      directory: "/tmp",
      title: "Session",
      version: "1",
      time: { created: 1, updated: 1 },
      agent: "reviewer",
      metadata: {},
    };
    const api = createSaveApi(session, sessionUpdates, switches);

    await saveProfile("balanced", "session", { api, options, profiles });

    expect(options.value.profile).toBe("existing");
    expect(sessionUpdates).toEqual([
      { sessionID: "session", metadata: { [PROFILE_METADATA_KEY]: "balanced" } },
    ]);
    expect(switches).toEqual([
      {
        sessionID: "session",
        model: { id: "reviewer", providerID: "forge", variant: "high" },
      },
    ]);
  });

  test("clears a pending profile before a failed in-session model switch", async () => {
    clearPendingProfile();
    try {
      const profiles = {
        balanced: Profile.parse({ models: { $default: { id: "default" } } }),
      };
      const options = createTestOptions(ForgeOptions.parse({ profile: "existing", profiles }));
      const sessionUpdates: CommandSessionUpdateInput[] = [];
      const switches: SessionSwitchModelInput[] = [];
      const session: ProfileSessionRecord = {
        id: "session",
        projectID: "project",
        directory: "/tmp",
        title: "Session",
        version: "1",
        time: { created: 1, updated: 1 },
        metadata: {},
      };
      writePendingProfile("stale");
      const api = createSaveApi(session, sessionUpdates, switches, "/tmp", true);

      await saveProfile("balanced", "session", { api, options, profiles });

      expect(sessionUpdates).toEqual([
        { sessionID: "session", metadata: { [PROFILE_METADATA_KEY]: "balanced" } },
      ]);
      expect(peekPendingProfile()).toBeUndefined();
    } finally {
      clearPendingProfile();
    }
  });

  test("saves a named profile globally and pins the current session", async () => {
    const profiles = {
      balanced: Profile.parse({ models: { $default: { id: "default" } } }),
    };
    const options = createTestOptions(ForgeOptions.parse({ profile: "existing", profiles }));
    const sessionUpdates: CommandSessionUpdateInput[] = [];
    const switches: SessionSwitchModelInput[] = [];
    const session: ProfileSessionRecord = {
      id: "session",
      projectID: "project",
      directory: "/tmp",
      title: "Session",
      version: "1",
      time: { created: 1, updated: 1 },
      metadata: {},
    };
    const api = createSaveApi(session, sessionUpdates, switches);

    await saveProfile("balanced", "global", { api, options, profiles });

    expect(options.value.profile).toBe("balanced");
    expect(sessionUpdates).toEqual([
      { sessionID: "session", metadata: { [PROFILE_METADATA_KEY]: "balanced" } },
    ]);
    expect(switches).toEqual([
      {
        sessionID: "session",
        model: { id: "default", providerID: "forge" },
      },
    ]);
  });

  test("clears a this-session profile pin without changing the global profile", async () => {
    const profiles = { balanced: Profile.parse({ models: {} }) };
    const options = createTestOptions(ForgeOptions.parse({ profile: "existing", profiles }));
    const sessionUpdates: CommandSessionUpdateInput[] = [];
    const switches: SessionSwitchModelInput[] = [];
    const session: ProfileSessionRecord = {
      id: "session",
      projectID: "project",
      directory: "/tmp",
      title: "Session",
      version: "1",
      time: { created: 1, updated: 1 },
      metadata: { [PROFILE_METADATA_KEY]: "balanced" },
    };
    const api = createSaveApi(session, sessionUpdates, switches);

    await saveProfile(null, "session", { api, options, profiles });

    expect(options.value.profile).toBe("existing");
    expect(options.writes).toHaveLength(0);
    expect(sessionUpdates).toEqual([{ sessionID: "session", metadata: {} }]);
    expect(switches).toHaveLength(0);
  });

  test("selects Desktop for this session without changing the global profile", async () => {
    const profiles = { balanced: Profile.parse({ models: {} }) };
    const options = createTestOptions(ForgeOptions.parse({ profile: "existing", profiles }));
    const sessionUpdates: CommandSessionUpdateInput[] = [];
    const switches: SessionSwitchModelInput[] = [];
    const session: ProfileSessionRecord = {
      id: "session",
      projectID: "project",
      directory: "/tmp",
      title: "Session",
      version: "1",
      time: { created: 1, updated: 1 },
      metadata: { [PROFILE_METADATA_KEY]: "balanced" },
    };
    const api = createSaveApi(session, sessionUpdates, switches);

    await saveProfile(DesktopProfile, "session", { api, options, profiles });

    expect(options.value.profile).toBe("existing");
    expect(options.writes).toHaveLength(0);
    expect(sessionUpdates).toEqual([{ sessionID: "session", metadata: {} }]);
    expect(switches).toHaveLength(0);
  });

  test("clears the global profile and the current session pin", async () => {
    const profiles = { balanced: Profile.parse({ models: {} }) };
    const options = createTestOptions(ForgeOptions.parse({ profile: "existing", profiles }));
    const sessionUpdates: CommandSessionUpdateInput[] = [];
    const switches: SessionSwitchModelInput[] = [];
    const session: ProfileSessionRecord = {
      id: "session",
      projectID: "project",
      directory: "/tmp",
      title: "Session",
      version: "1",
      time: { created: 1, updated: 1 },
      metadata: { [PROFILE_METADATA_KEY]: "balanced" },
    };
    const api = createSaveApi(session, sessionUpdates, switches);

    await saveProfile(null, "global", { api, options, profiles });

    expect(options.value.profile).toBeUndefined();
    expect(options.writes).toHaveLength(1);
    expect(sessionUpdates).toEqual([{ sessionID: "session", metadata: {} }]);
    expect(switches).toHaveLength(0);
  });

  test("selects Desktop globally and clears the current session pin", async () => {
    const profiles = { balanced: Profile.parse({ models: {} }) };
    const options = createTestOptions(ForgeOptions.parse({ profile: "existing", profiles }));
    const sessionUpdates: CommandSessionUpdateInput[] = [];
    const switches: SessionSwitchModelInput[] = [];
    const session: ProfileSessionRecord = {
      id: "session",
      projectID: "project",
      directory: "/tmp",
      title: "Session",
      version: "1",
      time: { created: 1, updated: 1 },
      metadata: { [PROFILE_METADATA_KEY]: "balanced" },
    };
    const api = createSaveApi(session, sessionUpdates, switches);

    await saveProfile(DesktopProfile, "global", { api, options, profiles });

    expect(options.value.profile).toBe("default");
    expect(options.writes).toHaveLength(1);
    expect(sessionUpdates).toEqual([{ sessionID: "session", metadata: {} }]);
    expect(switches).toHaveLength(0);
  });

  test("writes a pending profile without a session route", async () => {
    clearPendingProfile();
    try {
      const profiles = { balanced: Profile.parse({ models: {} }) };
      const options = createTestOptions(ForgeOptions.parse({ profile: "existing", profiles }));
      const sessionUpdates: CommandSessionUpdateInput[] = [];
      const switches: SessionSwitchModelInput[] = [];
      const api = Object.assign(createSaveApi(undefined, sessionUpdates, switches), {
        route: { current: { name: "home" } },
      });

      await saveProfile("balanced", "session", { api, options, profiles });

      expect(options.value.profile).toBe("existing");
      expect(options.writes).toHaveLength(0);
      expect(sessionUpdates).toHaveLength(0);
      expect(switches).toHaveLength(0);
      expect(peekPendingProfile()).toBe("balanced");
    } finally {
      clearPendingProfile();
    }
  });

  test("writes a global profile and clears a pending profile without a session route", async () => {
    clearPendingProfile();
    try {
      const profiles = { balanced: Profile.parse({ models: {} }) };
      const options = createTestOptions(ForgeOptions.parse({ profile: "existing", profiles }));
      const sessionUpdates: CommandSessionUpdateInput[] = [];
      const switches: SessionSwitchModelInput[] = [];
      writePendingProfile("stale");
      const api = Object.assign(createSaveApi(undefined, sessionUpdates, switches), {
        route: { current: { name: "home" } },
      });

      await saveProfile("balanced", "global", { api, options, profiles });

      expect(options.value.profile).toBe("balanced");
      expect(options.writes).toHaveLength(1);
      expect(sessionUpdates).toHaveLength(0);
      expect(switches).toHaveLength(0);
      expect(peekPendingProfile()).toBeUndefined();
    } finally {
      clearPendingProfile();
    }
  });

  test("writes a global profile without updating a session when no session route exists", async () => {
    const profiles = {
      balanced: Profile.parse({ models: { $default: { id: "default" } } }),
    };
    const options = createTestOptions(ForgeOptions.parse({ profile: "existing", profiles }));
    const sessionUpdates: CommandSessionUpdateInput[] = [];
    const switches: SessionSwitchModelInput[] = [];
    const api = Object.assign(createSaveApi(undefined, sessionUpdates, switches), {
      route: { current: { name: "home" } },
    });

    await saveProfile("balanced", "global", { api, options, profiles });

    expect(options.value.profile).toBe("balanced");
    expect(options.writes).toHaveLength(1);
    expect(sessionUpdates).toHaveLength(0);
    expect(switches).toHaveLength(0);
  });

  test("editor save persists profile definitions without changing the selected global profile", async () => {
    const profiles = {
      balanced: Profile.parse({ models: {} }),
    };
    const options = createTestOptions(ForgeOptions.parse({ profile: "existing", profiles }));
    const draft = Profile.parse({
      models: { $default: { id: "default", variant: "fast" }, $small: { id: "small" } },
    });

    await saveEditedProfile(options, profiles, "balanced", draft);

    expect(options.value.profile).toBe("existing");
    expect(options.value.profiles?.balanced).toEqual(draft);
    expect(options.writes).toHaveLength(1);
  });

  test("does not install a command-level interceptor for the opening key", () => {
    let intercepts = 0;
    let updates = 0;
    // SAFETY: this focused TUI fake implements every member ProfileCommand exercises.
    const api = Object.assign({} as TuiPluginApi, {
      route: { current: { name: "home" } },
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

function createTestOptions(initial: ForgeOptions) {
  let value = initial;
  const writes: ForgeOptions[] = [];
  // SAFETY: The fake implements the options members used by the profile save helpers.
  const options = {
    get value() {
      return value;
    },
    update: async (updater: Parameters<UseForgeOptions["update"]>[0]) => {
      value = ForgeOptions.parse(updater instanceof Function ? updater(value) : updater);
      writes.push(value);
      return value;
    },
    writes,
  } as UseForgeOptions & { writes: ForgeOptions[] };
  return options;
}

function createSaveApi(
  session: ProfileSessionRecord | undefined,
  sessionUpdates: CommandSessionUpdateInput[],
  switches: SessionSwitchModelInput[],
  directory = "/tmp",
  switchError = false,
) {
  // SAFETY: The fake implements the TUI route, session, client, and toast members used by saveProfile.
  return Object.assign({} as TuiPluginApi, {
    route: { current: { name: "session", params: { sessionID: "session" } } },
    state: { path: { directory }, session: { get: () => session } },
    client: {
      session: {
        update: async (input: CommandSessionUpdateInput) => {
          sessionUpdates.push(input);
        },
      },
      v2: {
        session: {
          switchModel: async (input: SessionSwitchModelInput) => {
            if (switchError) throw new Error("model switch failed");
            switches.push(input);
          },
        },
      },
    },
    ui: { toast: () => {} },
  });
}

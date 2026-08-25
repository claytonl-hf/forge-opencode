import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import type { Session } from "@opencode-ai/sdk";
import type { ModelRef } from "@opencode-ai/sdk/v2";

import { beforeEach, describe, expect, test } from "vitest";

import type { SessionMetadata } from "#common/session";

import { ProfileCommand, saveEditedProfile, saveProfile } from "#features/profiles/command";
import { applySessionProfile, onTuiSessionCreated } from "#features/profiles/lifecycle";
import { createProfileSessionListener } from "#features/profiles/listener";
import {
  DesktopProfile,
  filterOptions,
  ProfileScope,
  resolveProfileSelection,
  serializeProfileSelection,
  visibleHomeProfileTitle,
  visibleProfileTitle,
} from "#features/profiles/picker";
import {
  getProfileMetadata,
  getModelForSession,
  Profile,
  resolveProfileName,
  setProfileModel,
  type SessionProfile,
} from "#features/profiles/profile";
import { createProfileSessionHooks, type ProfileSessionClient } from "#features/profiles/session";
import { ForgeOptions, type UseForgeOptions } from "#plugin/options";
import { createEmptyPluginStore } from "#tests/plugin/fakes";

let store: ReturnType<typeof createEmptyPluginStore>;
beforeEach(() => {
  store = createEmptyPluginStore();
});

type ProfileSessionRecord = Pick<
  Session,
  "id" | "projectID" | "directory" | "title" | "version" | "time"
> & {
  parentID?: string;
  agent?: string;
  metadata?: SessionMetadata;
};
type SessionSwitchModelInput = { sessionID: string; model: ModelRef };
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

    setProfileModel(profile, "lead", { id: "old" });
    expect(profile.models.lead).toEqual({ id: "old", variant: "high" });

    setProfileModel(profile, "lead", { id: "new" });
    expect(profile.models.lead).toEqual({ id: "new" });
  });

  test("clears a variant when the same model explicitly omits it", () => {
    const profile = Profile.parse({ models: { lead: { id: "old", variant: "high" } } });

    setProfileModel(profile, "lead", { id: "old", provider: "forge", variant: undefined });

    expect(profile.models.lead).toEqual({ id: "old", provider: "forge" });
  });

  test("persists a selected provider for a model", () => {
    const profile = Profile.parse({ models: {} });

    setProfileModel(profile, "lead", { id: "sonnet", provider: "anthropic" });

    expect(profile.models.lead).toEqual({ id: "sonnet", provider: "anthropic" });
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

  test("parses Forge profile metadata and preserves other feature fields", () => {
    expect(
      getProfileMetadata({
        forge: {
          profile: { id: "balanced", models: { reviewer: { id: "reviewer" } } },
          otherFeature: { enabled: true, settings: { mode: "safe" } },
        },
      }),
    ).toEqual({
      profile: { id: "balanced", models: { reviewer: { id: "reviewer" } } },
      otherFeature: { enabled: true, settings: { mode: "safe" } },
    });
    expect(getProfileMetadata({ forge: { profile: { id: 42 } } })).toBeUndefined();
  });

  test("resolves session metadata before parent metadata and global options", () => {
    expect(
      resolveProfileName(
        { metadata: { forge: { profile: { id: "balanced" } } } },
        { metadata: { forge: { profile: { id: "missing" } } } },
        "missing",
        profiles,
      ),
    ).toBe("balanced");
    expect(
      resolveProfileName(
        undefined,
        { metadata: { forge: { profile: { id: "balanced" } } } },
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
        { metadata: { forge: { profile: { id: "balanced" } } } },
        { metadata: { forge: { profile: { id: "parent" } } } },
        "global",
        profiles,
      ),
    ).toBe("Balanced");
    expect(
      visibleProfileTitle(
        undefined,
        { metadata: { forge: { profile: { id: "parent" } } } },
        "global",
        profiles,
      ),
    ).toBe("Parent");
    expect(visibleProfileTitle(undefined, undefined, "global", profiles)).toBe("global");
  });

  test("prefers a session profile title over the global profile", () => {
    expect(visibleHomeProfileTitle({ id: "balanced" }, "global", profiles)).toBe("Balanced");
    expect(
      visibleHomeProfileTitle(
        { id: "balanced", models: { reviewer: { id: "session-reviewer" } } },
        "global",
        profiles,
      ),
    ).toBe("Balanced*");
    expect(visibleHomeProfileTitle(undefined, "global", profiles)).toBe("global");
    expect(visibleHomeProfileTitle(null, "global", profiles)).toBe("global");
  });

  test("marks session and home titles with model overrides", () => {
    expect(
      visibleProfileTitle(
        { metadata: { forge: { profile: { id: "balanced" } } } },
        undefined,
        "global",
        profiles,
      ),
    ).toBe("Balanced");
    expect(
      visibleProfileTitle(
        {
          metadata: {
            forge: { profile: { id: "balanced", models: { reviewer: { id: "custom" } } } },
          },
        },
        undefined,
        "global",
        profiles,
      ),
    ).toBe("Balanced*");
    expect(visibleHomeProfileTitle({ id: "balanced" }, "global", profiles)).toBe("Balanced");
    expect(
      visibleHomeProfileTitle(
        { id: "balanced", models: { reviewer: { id: "custom" } } },
        "global",
        profiles,
      ),
    ).toBe("Balanced*");
  });

  test("hides missing, unknown, and Desktop Default selections", () => {
    expect(visibleProfileTitle(undefined, undefined, undefined, profiles)).toBeUndefined();
    expect(visibleProfileTitle(undefined, undefined, "missing", profiles)).toBeUndefined();
    expect(visibleProfileTitle(undefined, undefined, "default", profiles)).toBeUndefined();
  });

  test("prefers an agent mapping and falls back to the default mapping", () => {
    expect(getModelForSession(profiles.balanced, "reviewer")).toEqual({
      id: "reviewer",
      providerID: "forge",
      variant: "high",
    });
    expect(getModelForSession(profiles.balanced, "missing")).toEqual({
      id: "default",
      providerID: "forge",
      variant: "medium",
    });
    expect(getModelForSession(Profile.parse({ models: {} }), "reviewer")).toBeUndefined();
  });

  test("resolves a configured provider to the SDK providerID", () => {
    const profile = Profile.parse({
      models: { $default: { id: "sonnet", provider: "anthropic" } },
    });

    expect(getModelForSession(profile)).toEqual({ id: "sonnet", providerID: "anthropic" });
  });

  test("resolves session model overrides before configured profile models", () => {
    const metadata: SessionMetadata = {
      forge: {
        profile: {
          id: "balanced",
          models: {
            reviewer: { id: "session-reviewer", variant: "fast" },
            $default: { id: "session-default" },
          },
        },
      },
    };

    expect(getModelForSession(profiles.balanced, "reviewer", metadata)).toEqual({
      id: "session-reviewer",
      providerID: "forge",
      variant: "fast",
    });
    expect(getModelForSession(profiles.balanced, "missing", metadata)).toEqual({
      id: "session-default",
      providerID: "forge",
    });
  });

  test("applies all four model resolution precedence levels", () => {
    const profile = Profile.parse({
      models: {
        $default: { id: "profile-default" },
        reviewer: { id: "profile-agent" },
      },
    });

    expect(getModelForSession(profile, "reviewer")).toEqual({
      id: "profile-agent",
      providerID: "forge",
    });
    expect(
      getModelForSession(profile, "reviewer", {
        forge: { profile: { id: "balanced", models: { $default: { id: "session-default" } } } },
      }),
    ).toEqual({
      id: "profile-agent",
      providerID: "forge",
    });
    expect(
      getModelForSession(profile, "missing", {
        forge: { profile: { id: "balanced", models: { $default: { id: "session-default" } } } },
      }),
    ).toEqual({
      id: "session-default",
      providerID: "forge",
    });
    expect(
      getModelForSession(profile, "reviewer", {
        forge: {
          profile: {
            id: "balanced",
            models: {
              reviewer: { id: "session-agent" },
              $default: { id: "session-default" },
            },
          },
        },
      }),
    ).toEqual({
      id: "session-agent",
      providerID: "forge",
    });
    expect(
      getModelForSession(profile, "$small", {
        forge: {
          profile: {
            id: "balanced",
            models: { $small: { id: "small" }, $default: { id: "session-default" } },
          },
        },
      }),
    ).toEqual({
      id: "session-default",
      providerID: "forge",
    });
  });
});

describe("session profile subscriptions", () => {
  test("notifies listeners when session state changes and stops after unsubscribe", () => {
    store.session.profile.set(undefined);
    const values: SessionProfile[] = [];
    const unsubscribe = store.session.profile.listen((value) => values.push(value));

    try {
      store.session.profile.set({ id: "balanced" });
      store.session.profile.set(undefined);
      store.session.profile.set({ id: "session" });
      expect(store.session.profile.get()).toEqual({ id: "session" });

      expect(values).toEqual([{ id: "balanced" }, undefined, { id: "session" }]);

      unsubscribe();
      store.session.profile.set({ id: "ignored" });
      expect(values).toEqual([{ id: "balanced" }, undefined, { id: "session" }]);
    } finally {
      unsubscribe();
      store.session.profile.set(undefined);
    }
  });
});

describe("profile session hooks", () => {
  test("inherits a parent profile through the TUI and leaves session profile untouched", async () => {
    store.session.profile.set(undefined);
    const sessions = {
      parent: {
        id: "parent",
        projectID: "project",
        directory: "/tmp",
        title: "Parent",
        version: "1",
        time: { created: 1, updated: 1 },
        metadata: {
          preserved: "parent",
          forge: {
            profile: {
              id: "balanced",
              models: { reviewer: { id: "parent-reviewer" } },
            },
          },
        },
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
        metadata: { preserved: "child" },
      },
    } satisfies Record<"parent" | "child", ProfileSessionRecord>;
    const updates: Array<{ sessionID: string; metadata: SessionMetadata }> = [];
    const switches: SessionSwitchModelInput[] = [];
    try {
      store.session.profile.set({ id: "session" });
      await onTuiSessionCreated({
        store,
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
          metadata: {
            preserved: "child",
            forge: { profile: { id: "balanced" } },
          },
        },
      ]);
      expect(switches).toEqual([
        {
          sessionID: "child",
          model: { id: "reviewer", providerID: "forge", variant: "high" },
        },
      ]);
      expect(store.session.profile.get()).toEqual({ id: "session" });
    } finally {
      store.session.profile.set(undefined);
    }
  });

  test("applies a session profile to a top-level session and leaves it unchanged", async () => {
    store.session.profile.set(undefined);
    try {
      store.session.profile.set({ id: "balanced" });
      const updates: Array<{ sessionID: string; metadata: SessionMetadata }> = [];
      const switches: SessionSwitchModelInput[] = [];
      await applySessionProfile({
        store,
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
          metadata: { forge: { profile: { id: "balanced" } } },
        },
      ]);
      expect(switches).toEqual([
        {
          sessionID: "top-level",
          model: { id: "reviewer", providerID: "forge", variant: "high" },
        },
      ]);
      expect(store.session.profile.get()).toEqual({ id: "balanced" });
    } finally {
      store.session.profile.set(undefined);
    }
  });

  test("stamps only the pending session profile and switches to its configured model", async () => {
    store.session.profile.set(undefined);
    try {
      store.session.profile.set({ id: "balanced" });
      const updates: Array<{ sessionID: string; metadata: SessionMetadata }> = [];
      const switches: SessionSwitchModelInput[] = [];

      await onTuiSessionCreated({
        store,
        sessionID: "top-level",
        agent: "reviewer",
        model: { id: "session-reviewer", providerID: "forge", variant: "fast" },
        metadata: { preserved: "value" },
        profiles: {
          balanced: Profile.parse({
            models: { reviewer: { id: "reviewer", variant: "high" } },
          }),
        },
        getParent: async () => undefined,
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
          metadata: {
            preserved: "value",
            forge: { profile: { id: "balanced" } },
          },
        },
      ]);
      expect(switches).toEqual([
        {
          sessionID: "top-level",
          model: { id: "reviewer", providerID: "forge", variant: "high" },
        },
      ]);
    } finally {
      store.session.profile.set(undefined);
    }
  });

  test("stamps existing session profile models and switches to the explicit override", async () => {
    store.session.profile.set(undefined);
    try {
      store.session.profile.set({
        id: "balanced",
        models: { reviewer: { id: "session-reviewer", variant: "fast" } },
      });
      const updates: Array<{ sessionID: string; metadata: SessionMetadata }> = [];
      const switches: SessionSwitchModelInput[] = [];

      await onTuiSessionCreated({
        store,
        sessionID: "top-level",
        agent: "reviewer",
        model: { id: "create-time-model", providerID: "forge" },
        metadata: { preserved: "value" },
        profiles: {
          balanced: Profile.parse({
            models: { reviewer: { id: "reviewer", variant: "high" } },
          }),
        },
        getParent: async () => undefined,
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
          metadata: {
            preserved: "value",
            forge: {
              profile: {
                id: "balanced",
                models: { reviewer: { id: "session-reviewer", variant: "fast" } },
              },
            },
          },
        },
      ]);
      expect(switches).toEqual([
        {
          sessionID: "top-level",
          model: { id: "session-reviewer", providerID: "forge", variant: "fast" },
        },
      ]);
    } finally {
      store.session.profile.set(undefined);
    }
  });

  test("does not stamp a session override when the model has no id", async () => {
    store.session.profile.set(undefined);
    try {
      store.session.profile.set({ id: "balanced" });
      const updates: SessionMetadata[] = [];
      await applySessionProfile({
        store,
        sessionID: "top-level",
        agent: "reviewer",
        model: { id: "", providerID: "forge" },
        profiles: {
          balanced: Profile.parse({ models: { reviewer: { id: "reviewer" } } }),
        },
        update: async (_sessionID, metadata) => {
          updates.push(metadata);
        },
        switchModel: async () => {},
      });

      expect(updates).toEqual([{ forge: { profile: { id: "balanced" } } }]);
    } finally {
      store.session.profile.set(undefined);
    }
  });

  test("leaves session profile for child sessions", async () => {
    store.session.profile.set(undefined);
    try {
      store.session.profile.set({ id: "balanced" });
      const updates: Array<{ sessionID: string; metadata: SessionMetadata }> = [];
      await applySessionProfile({
        store,
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
          throw new Error("child sessions must not switch from session state");
        },
      });

      expect(updates).toHaveLength(0);
      expect(store.session.profile.get()).toEqual({ id: "balanced" });
    } finally {
      store.session.profile.set(undefined);
    }
  });

  test("leaves a session profile when applying its metadata fails", async () => {
    store.session.profile.set(undefined);
    try {
      store.session.profile.set({ id: "balanced" });
      await applySessionProfile({
        store,
        sessionID: "top-level",
        profiles: { balanced: Profile.parse({ models: {} }) },
        update: async () => {
          throw new Error("metadata update failed");
        },
        switchModel: async () => {},
      });

      expect(store.session.profile.get()).toEqual({ id: "balanced" });
    } finally {
      store.session.profile.set(undefined);
    }
  });

  test("leaves a session profile when switching its model fails", async () => {
    store.session.profile.set(undefined);
    try {
      store.session.profile.set({ id: "balanced" });
      await applySessionProfile({
        store,
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

      expect(store.session.profile.get()).toEqual({ id: "balanced" });
    } finally {
      store.session.profile.set(undefined);
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
            metadata: {
              forge: {
                profile: {
                  id: "balanced",
                  models: { reviewer: { id: "session-reviewer", variant: "fast" } },
                },
              },
            },
          },
        }),
      },
    };
    const hooks = createProfileSessionHooks({
      client,
      directory: "/tmp",
      getGlobalProfile: () => undefined,
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
    const model = {
      providerID: "forge",
      modelID: "session-reviewer",
      variant: "fast",
    };
    expect(output.message.model).toEqual(model);
  });
});

describe("profile session listener", () => {
  const profiles = {
    balanced: Profile.parse({
      models: {
        $default: { id: "default", variant: "medium" },
        reviewer: { id: "reviewer", variant: "high" },
      },
    }),
  };

  test("captures a changed agent model without dropping other metadata", async () => {
    const updates: Array<{ sessionID: string; metadata: SessionMetadata }> = [];
    const listener = createProfileSessionListener({
      getProfiles: () => profiles,
      update: async (sessionID, metadata) => {
        updates.push({ sessionID, metadata });
      },
    });

    // SAFETY: the listener only reads properties.info.{id,agent,model,metadata} from this focused session.updated fixture.
    listener({
      id: "event",
      type: "session.updated",
      properties: {
        sessionID: "session",
        info: {
          id: "session",
          agent: "reviewer",
          model: { id: "alternate", providerID: "forge", variant: "fast" },
          metadata: {
            preserved: "value",
            forge: {
              profile: {
                id: "balanced",
                models: { $default: { id: "default-override" } },
              },
            },
          },
        },
      },
    } as never);
    await Promise.resolve();

    expect(updates).toEqual([
      {
        sessionID: "session",
        metadata: {
          preserved: "value",
          forge: {
            profile: {
              id: "balanced",
              models: {
                $default: { id: "default-override" },
                reviewer: { id: "alternate", variant: "fast" },
              },
            },
          },
        },
      },
    ]);
  });

  test("persists a changed non-Forge model with its provider", async () => {
    const updates: SessionMetadata[] = [];
    const listener = createProfileSessionListener({
      getProfiles: () => profiles,
      update: async (_sessionID, metadata) => {
        updates.push(metadata);
      },
    });

    // SAFETY: the listener only reads properties.info.{id,agent,model,metadata} from this focused session.updated fixture.
    listener({
      id: "event",
      type: "session.updated",
      properties: {
        sessionID: "session",
        info: {
          id: "session",
          agent: "reviewer",
          model: { id: "openai-model", providerID: "openai" },
          metadata: { forge: { profile: { id: "balanced" } } },
        },
      },
    } as never);
    await Promise.resolve();

    expect(updates).toEqual([
      {
        forge: {
          profile: {
            id: "balanced",
            models: { reviewer: { id: "openai-model", provider: "openai" } },
          },
        },
      },
    ]);
  });

  test("preserves an agent model matching the profile when a default override shadows fallback", async () => {
    const updates: SessionMetadata[] = [];
    const listener = createProfileSessionListener({
      getProfiles: () => profiles,
      update: async (_sessionID, metadata) => {
        updates.push(metadata);
      },
    });

    // SAFETY: the listener only reads properties.info.{id,agent,model,metadata} from this focused session.updated fixture.
    listener({
      properties: {
        sessionID: "session",
        info: {
          id: "session",
          agent: "writer",
          model: { id: "default", providerID: "forge", variant: "medium" },
          metadata: {
            forge: {
              profile: {
                id: "balanced",
                models: { $default: { id: "session-default" } },
              },
            },
          },
        },
      },
    } as never);
    await Promise.resolve();

    expect(updates).toEqual([
      {
        forge: {
          profile: {
            id: "balanced",
            models: {
              $default: { id: "session-default" },
              writer: { id: "default", variant: "medium" },
            },
          },
        },
      },
    ]);
  });

  test("uses the configured global profile when the session has no profile pin", async () => {
    const updates: SessionMetadata[] = [];
    const listener = createProfileSessionListener({
      getGlobalProfile: () => "balanced",
      getProfiles: () => profiles,
      update: async (_sessionID, metadata) => {
        updates.push(metadata);
      },
    });

    // SAFETY: the listener only reads properties.info.{id,agent,model,metadata} from this focused session.updated fixture.
    listener({
      properties: {
        sessionID: "session",
        info: {
          id: "session",
          agent: "reviewer",
          model: { id: "alternate", providerID: "forge" },
          metadata: { preserved: "value" },
        },
      },
    } as never);
    await Promise.resolve();

    expect(updates).toEqual([
      {
        preserved: "value",
        forge: {
          profile: {
            id: "balanced",
            models: { reviewer: { id: "alternate" } },
          },
        },
      },
    ]);
  });

  test("removes an agent override when the configured model is selected", async () => {
    const updates: SessionMetadata[] = [];
    const listener = createProfileSessionListener({
      getProfiles: () => profiles,
      update: async (_sessionID, metadata) => {
        updates.push(metadata);
      },
    });

    // SAFETY: the listener only reads properties.info.{id,agent,model,metadata} from this focused session.updated fixture.
    listener({
      properties: {
        sessionID: "session",
        info: {
          id: "session",
          agent: "reviewer",
          model: { id: "reviewer", providerID: "forge", variant: "high" },
          metadata: {
            forge: {
              profile: {
                id: "balanced",
                models: {
                  reviewer: { id: "alternate", variant: "fast" },
                },
              },
            },
          },
        },
      },
    } as never);
    await Promise.resolve();

    expect(updates).toEqual([{ forge: { profile: { id: "balanced" } } }]);
  });

  test("skips an update when the session override already matches the model", async () => {
    const updates: SessionMetadata[] = [];
    const listener = createProfileSessionListener({
      getProfiles: () => profiles,
      update: async (_sessionID, metadata) => {
        updates.push(metadata);
      },
    });

    // SAFETY: the listener only reads properties.info.{id,agent,model,metadata} from this focused session.updated fixture.
    listener({
      properties: {
        sessionID: "session",
        info: {
          id: "session",
          agent: "reviewer",
          model: { id: "alternate", providerID: "forge", variant: "fast" },
          metadata: {
            preserved: "value",
            forge: {
              profile: {
                id: "balanced",
                models: { reviewer: { id: "alternate", variant: "fast" } },
              },
            },
          },
        },
      },
    } as never);
    await Promise.resolve();

    expect(updates).toEqual([]);
  });

  test("does not overlap writes when session updates arrive during a metadata write", async () => {
    let resolveUpdate: (() => void) | undefined;
    let concurrentUpdates = 0;
    let maxConcurrentUpdates = 0;
    const listener = createProfileSessionListener({
      getProfiles: () => profiles,
      update: async () => {
        concurrentUpdates += 1;
        maxConcurrentUpdates = Math.max(maxConcurrentUpdates, concurrentUpdates);
        await new Promise<void>((resolve) => {
          resolveUpdate = resolve;
        });
        concurrentUpdates -= 1;
      },
    });
    const event = {
      id: "event",
      type: "session.updated",
      properties: {
        sessionID: "session",
        info: {
          id: "session",
          agent: "reviewer",
          model: { id: "alternate", providerID: "forge" },
          metadata: { forge: { profile: { id: "balanced" } } },
        },
      },
    } as const;

    // SAFETY: the listener only reads properties.info.{id,agent,model,metadata} from this focused session.updated fixture.
    listener(event as never);
    // SAFETY: the listener only reads properties.info.{id,agent,model,metadata} from this focused session.updated fixture.
    listener(event as never);
    await Promise.resolve();
    expect(maxConcurrentUpdates).toBe(1);

    resolveUpdate?.();
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
    resolveUpdate?.();
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
  });

  test("persists the latest model when a session update arrives during a metadata write", async () => {
    let resolveUpdate: (() => void) | undefined;
    const updates: SessionMetadata[] = [];
    const listener = createProfileSessionListener({
      getProfiles: () => profiles,
      update: async (_sessionID, metadata) => {
        updates.push(metadata);
        await new Promise<void>((resolve) => {
          resolveUpdate = resolve;
        });
      },
    });
    const createEvent = (modelID: string) =>
      ({
        id: "event",
        type: "session.updated",
        properties: {
          sessionID: "session",
          info: {
            id: "session",
            agent: "reviewer",
            model: { id: modelID, providerID: "forge" },
            metadata: { forge: { profile: { id: "balanced" } } },
          },
        },
      }) as const;

    // SAFETY: the listener only reads properties.info.{id,agent,model,metadata} from this focused session.updated fixture.
    listener(createEvent("model-a") as never);
    await Promise.resolve();
    // SAFETY: the listener only reads properties.info.{id,agent,model,metadata} from this focused session.updated fixture.
    listener(createEvent("model-b") as never);

    resolveUpdate?.();
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
    resolveUpdate?.();
    for (let index = 0; index < 5; index += 1) await Promise.resolve();

    expect(getProfileMetadata(updates.at(-1))?.profile?.models?.reviewer).toEqual({
      id: "model-b",
    });
  });

  test("ignores a session model without an id", async () => {
    const updates: SessionMetadata[] = [];
    const listener = createProfileSessionListener({
      getProfiles: () => profiles,
      update: async (_sessionID, metadata) => {
        updates.push(metadata);
      },
    });

    // SAFETY: this focused fixture intentionally omits the model id to verify the listener guard; the listener only reads properties.info.{id,agent,model,metadata}.
    listener({
      properties: {
        sessionID: "session",
        info: {
          id: "session",
          agent: "reviewer",
          model: { id: "", providerID: "forge" },
          metadata: { forge: { profile: { id: "balanced" } } },
        },
      },
    } as never);
    await Promise.resolve();

    expect(updates).toEqual([]);
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
      metadata: {
        preserved: "value",
        forge: {
          profile: {
            id: "old",
            models: { reviewer: { id: "old-reviewer" } },
          },
        },
      },
    };
    const api = createSaveApi(session, sessionUpdates, switches);

    await saveProfile("balanced", ProfileScope.Session, { api, options, profiles, store });

    expect(options.value.profile).toBe("existing");
    expect(sessionUpdates).toEqual([
      {
        sessionID: "session",
        metadata: { preserved: "value", forge: { profile: { id: "balanced" } } },
      },
    ]);
    expect(switches).toEqual([
      {
        sessionID: "session",
        model: { id: "reviewer", providerID: "forge", variant: "high" },
      },
    ]);
  });

  test("replaces a session profile before a failed in-session model switch", async () => {
    store.session.profile.set(undefined);
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
      store.session.profile.set({ id: "stale" });
      const api = createSaveApi(session, sessionUpdates, switches, "/tmp", true);

      await saveProfile("balanced", ProfileScope.Session, { api, options, profiles, store });

      expect(sessionUpdates).toEqual([
        { sessionID: "session", metadata: { forge: { profile: { id: "balanced" } } } },
      ]);
      expect(store.session.profile.get()).toEqual({ id: "balanced" });
    } finally {
      store.session.profile.set(undefined);
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

    await saveProfile("balanced", ProfileScope.Global, { api, options, profiles, store });

    expect(options.value.profile).toBe("balanced");
    expect(sessionUpdates).toEqual([
      { sessionID: "session", metadata: { forge: { profile: { id: "balanced" } } } },
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
      metadata: {
        preserved: "value",
        forge: {
          profile: {
            id: "balanced",
            models: { reviewer: { id: "alternate" } },
          },
        },
      },
    };
    const api = createSaveApi(session, sessionUpdates, switches);

    store.session.profile.set({ id: "stale" });
    try {
      await saveProfile(null, ProfileScope.Session, { api, options, profiles, store });

      expect(options.value.profile).toBe("existing");
      expect(options.writes).toHaveLength(0);
      expect(sessionUpdates).toEqual([{ sessionID: "session", metadata: { preserved: "value" } }]);
      expect(switches).toHaveLength(0);
      expect(store.session.profile.get()).toBeNull();
    } finally {
      store.session.profile.set(undefined);
    }
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
      metadata: { forge: { profile: { id: "balanced" } } },
    };
    const api = createSaveApi(session, sessionUpdates, switches);

    store.session.profile.set({ id: "stale" });
    try {
      await saveProfile(DesktopProfile, ProfileScope.Session, { api, options, profiles, store });

      expect(options.value.profile).toBe("existing");
      expect(options.writes).toHaveLength(0);
      expect(sessionUpdates).toEqual([{ sessionID: "session", metadata: {} }]);
      expect(switches).toHaveLength(0);
      expect(store.session.profile.get()).toBeNull();
    } finally {
      store.session.profile.set(undefined);
    }
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
      metadata: { forge: { profile: { id: "balanced" } } },
    };
    const api = createSaveApi(session, sessionUpdates, switches);

    await saveProfile(null, ProfileScope.Global, { api, options, profiles, store });

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
      metadata: { forge: { profile: { id: "balanced" } } },
    };
    const api = createSaveApi(session, sessionUpdates, switches);

    await saveProfile(DesktopProfile, ProfileScope.Global, { api, options, profiles, store });

    expect(options.value.profile).toBe("default");
    expect(options.writes).toHaveLength(1);
    expect(sessionUpdates).toEqual([{ sessionID: "session", metadata: {} }]);
    expect(switches).toHaveLength(0);
  });

  test("writes a session profile without a session route", async () => {
    store.session.profile.set(undefined);
    try {
      const profiles = { balanced: Profile.parse({ models: {} }) };
      const options = createTestOptions(ForgeOptions.parse({ profile: "existing", profiles }));
      const sessionUpdates: CommandSessionUpdateInput[] = [];
      const switches: SessionSwitchModelInput[] = [];
      const api = Object.assign(createSaveApi(undefined, sessionUpdates, switches), {
        route: { current: { name: "home" } },
      });

      await saveProfile("balanced", ProfileScope.Session, { api, options, profiles, store });

      expect(options.value.profile).toBe("existing");
      expect(options.writes).toHaveLength(0);
      expect(sessionUpdates).toHaveLength(0);
      expect(switches).toHaveLength(0);
      expect(store.session.profile.get()).toEqual({ id: "balanced" });
    } finally {
      store.session.profile.set(undefined);
    }
  });

  test("clears a session profile without a session route", async () => {
    store.session.profile.set(undefined);
    try {
      const profiles = { balanced: Profile.parse({ models: {} }) };
      const options = createTestOptions(ForgeOptions.parse({ profile: "existing", profiles }));
      const sessionUpdates: CommandSessionUpdateInput[] = [];
      const switches: SessionSwitchModelInput[] = [];
      store.session.profile.set({ id: "stale" });
      const api = Object.assign(createSaveApi(undefined, sessionUpdates, switches), {
        route: { current: { name: "home" } },
      });

      await saveProfile(null, ProfileScope.Session, { api, options, profiles, store });

      expect(options.value.profile).toBe("existing");
      expect(options.writes).toHaveLength(0);
      expect(sessionUpdates).toHaveLength(0);
      expect(switches).toHaveLength(0);
      expect(store.session.profile.get()).toBeNull();
    } finally {
      store.session.profile.set(undefined);
    }
  });

  test("writes a global profile and clears a session profile without a session route", async () => {
    store.session.profile.set(undefined);
    try {
      const profiles = { balanced: Profile.parse({ models: {} }) };
      const options = createTestOptions(ForgeOptions.parse({ profile: "existing", profiles }));
      const sessionUpdates: CommandSessionUpdateInput[] = [];
      const switches: SessionSwitchModelInput[] = [];
      store.session.profile.set({ id: "stale" });
      const api = Object.assign(createSaveApi(undefined, sessionUpdates, switches), {
        route: { current: { name: "home" } },
      });

      await saveProfile("balanced", ProfileScope.Global, { api, options, profiles, store });

      expect(options.value.profile).toBe("balanced");
      expect(options.writes).toHaveLength(1);
      expect(sessionUpdates).toHaveLength(0);
      expect(switches).toHaveLength(0);
      expect(store.session.profile.get()).toBeUndefined();
    } finally {
      store.session.profile.set(undefined);
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

    await saveProfile("balanced", ProfileScope.Global, { api, options, profiles, store });

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

  test("does not install a command-level interceptor for the opening key", async () => {
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
    const command = ProfileCommand(api, options, store);

    // SAFETY: ProfileCommand does not inspect its invocation argument.
    await command.run({} as never);

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

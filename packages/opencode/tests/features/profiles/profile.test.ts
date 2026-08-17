import type { TuiPluginApi } from "@opencode-ai/plugin/tui";

import { describe, expect, test } from "bun:test";

import { ProfileCommand } from "../../../src/features/profiles/command";
import {
  DesktopProfile,
  filterOptions,
  resolveProfileSelection,
  serializeProfileSelection,
} from "../../../src/features/profiles/picker";
import { Profile, setProfileModel } from "../../../src/features/profiles/profile";
import { ForgeOptions, type UseForgeOptions } from "../../../src/plugin/options";

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

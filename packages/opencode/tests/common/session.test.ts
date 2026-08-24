import { describe, expect, test } from "vitest";
import { z } from "zod";

import type { SessionMetadata } from "#common/session";

import { getSessionMetadata } from "#common/session";

describe("session metadata helpers", () => {
  test("parses arbitrary metadata keys with the provided schema", () => {
    const metadata = { custom: { value: 42 }, other: "preserved" };

    expect(getSessionMetadata(metadata, "custom", z.object({ value: z.number() }))).toEqual({
      value: 42,
    });
    expect(getSessionMetadata(metadata, "other", z.string())).toBe("preserved");
  });

  test("returns undefined for non-record metadata, missing keys, or invalid values", () => {
    const metadata: SessionMetadata = { custom: "invalid", missing: true };

    expect(getSessionMetadata(undefined, "custom", z.unknown())).toBeUndefined();
    expect(getSessionMetadata(metadata, "custom", z.number())).toBeUndefined();
    expect(getSessionMetadata(metadata, "unknown", z.number())).toBeUndefined();
  });

  test("supports loose record schemas for arbitrary namespaces", () => {
    expect(
      getSessionMetadata(
        {
          feature: { enabled: true, settings: { mode: "safe" } },
        },
        "feature",
        z.record(z.string(), z.unknown()),
      ),
    ).toEqual({
      enabled: true,
      settings: { mode: "safe" },
    });
  });
});

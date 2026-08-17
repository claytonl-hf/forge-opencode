import { describe, expect, mock, test } from "bun:test";

import { WebCommand } from "../../../src/features/web/command";

describe("/forge:web command", () => {
  test("requires an active session", () => {
    const toast = mock(() => {});
    const api = { route: { current: { name: "home" } }, ui: { toast } };
    // SAFETY: the home-route branch only reads route.current and ui.toast.
    const command = WebCommand(api as never, "/tmp/web-bridge");

    // SAFETY: WebCommand does not inspect its invocation argument.
    command.run({} as never);

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "warning", message: expect.stringContaining("session") }),
    );
  });

  test("exposes the reusable bridge action as forge:web", () => {
    // SAFETY: command metadata is constructed without reading the API.
    const command = WebCommand({} as never, "/tmp/web-bridge");

    expect(command.name).toBe("forge:web");
    expect(command.slashName).toBe("forge:web");
  });
});

import { describe, expect, mock, test } from "bun:test";

import { registerSlots } from "../../../src/plugin/tui/slots";

describe("registerSlots", () => {
  test("positions sidebar content below LSP", () => {
    // SAFETY: render output is opaque to this test; only slot ordering and identity are asserted.
    const workers = () => "workers" as never;
    const register = mock(() => "slot");

    // SAFETY: this focused API fake implements slots.register, the only operation under test.
    registerSlots({ slots: { register } } as never, [{ sidebar_content: workers }]);

    expect(register).toHaveBeenCalledWith({
      order: 350,
      slots: { sidebar_content: workers },
    });
  });

  test("does not create a Forge section for empty line contributions", () => {
    const register = mock(() => "slot");

    // SAFETY: this focused API fake implements slots.register, the only operation under test.
    registerSlots({ slots: { register } } as never, [{ sidebar_content: [] }]);

    expect(register).not.toHaveBeenCalled();
  });
});

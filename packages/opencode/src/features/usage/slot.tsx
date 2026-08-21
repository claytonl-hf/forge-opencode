/** @jsxImportSource @opentui/solid */

import type { Forge, ForgeUsage } from "@forge/core";
import type { TuiPluginApi, TuiSlotContext } from "@opencode-ai/plugin/tui";

import { createSignal, onCleanup, onMount, type ComponentProps } from "solid-js";

import type { TuiSlots } from "#plugin/integrations/types";

type Props = ComponentProps<"box"> &
  TuiSlotContext & {
    api: TuiPluginApi;
    forge: Forge;
    poll?: number;
    variant: "line" | "status";
  };

function Usage({ api, theme, forge, poll, variant, ...props }: Props) {
  const [usage, setUsage] = createSignal<ForgeUsage | null | undefined>();
  const balance = () => {
    const value = usage()?.budget.spentCreditsToday ?? 0;
    const total = usage()?.budget.dailyBudgetCredits ?? 0;

    return total - value;
  };

  let timer: ReturnType<typeof setTimeout>;
  let disposed = false;

  void api;

  async function refresh() {
    try {
      const next = await forge.usage();

      if (!disposed) setUsage(next);
    } finally {
      if (!disposed) {
        timer = setTimeout(() => {
          void refresh();
        }, poll);
      }
    }
  }

  onMount(() => {
    void refresh();
  });

  onCleanup(() => {
    disposed = true;
    clearTimeout(timer);
  });

  return (
    <box flexDirection="row" alignItems="center" {...props}>
      <text style={{ fg: theme.current.textMuted }}>
        {variant === "status" && <b style={{ fg: theme.current.primary }}>Forge • </b>}
        <span style={{ fg: theme.current.text }}>${balance().toFixed(2)}</span> left today
      </text>
    </box>
  );
}

export function UsageSlots(api: TuiPluginApi, forge: Forge): TuiSlots {
  return {
    home_bottom: (context) => (
      <Usage api={api} theme={context.theme} forge={forge} variant="status" marginTop={1} />
    ),
    sidebar_content: [
      (context) => <Usage api={api} theme={context.theme} forge={forge} variant="line" />,
    ],
  };
}

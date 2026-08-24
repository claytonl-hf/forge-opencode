/** @jsxImportSource @opentui/solid */

import type { ForgeUsage } from "@forge/core";
import type { TuiSlotContext } from "@opencode-ai/plugin/tui";

import { createSignal, onCleanup, onMount, type ComponentProps } from "solid-js";

import type { TuiSlots } from "#plugin/integrations/types";
import type { PluginStore } from "#plugin/store";

type Props = ComponentProps<"box"> &
  TuiSlotContext & {
    usage: PluginStore["usage"];
    variant: "line" | "status";
  };

function Usage({ theme, usage: resource, variant, ...props }: Props) {
  const [usage, setUsage] = createSignal<ForgeUsage | null | undefined>(resource.get());
  const balance = () => {
    const value = usage()?.budget.spentCreditsToday ?? 0;
    const total = usage()?.budget.dailyBudgetCredits ?? 0;

    return total - value;
  };

  onMount(() => {
    const stop = resource.listen((next) => setUsage(next));
    onCleanup(stop);
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

export function UsageSlots(store: PluginStore): TuiSlots {
  return {
    home_bottom: (context) => (
      <Usage theme={context.theme} usage={store.usage} variant="status" marginTop={1} />
    ),
    sidebar_content: [
      (context) => <Usage theme={context.theme} usage={store.usage} variant="line" />,
    ],
  };
}

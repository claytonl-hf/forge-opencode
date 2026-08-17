/** @jsxImportSource @opentui/solid */

import type { TuiSlotContext, TuiSlotPlugin } from "@opencode-ai/plugin/tui";

const FORGE_ART = [
  " ███████╗ ██████╗ ██████╗  ██████╗ ███████╗",
  " ██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝",
  " █████╗  ██║   ██║██████╔╝██║  ███╗█████╗  ",
  " ██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝  ",
  " ██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗",
  " ╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝",
] as const;

const FORGE_TAGLINE = "By HumanForce";
const HF_PRIMARY = "#3c489f";
const HF_SECONDARY = "#ffd042";

type ThemeColors = TuiSlotContext["theme"]["current"];

function themeColor(map: ThemeColors, name: "primary" | "textMuted", fallback: string) {
  return map[name] ?? fallback;
}

export function Home({ theme }: TuiSlotContext): TuiSlotPlugin {
  const primary = themeColor(theme.current, "primary", HF_PRIMARY);
  const muted = themeColor(theme.current, "textMuted", HF_SECONDARY);

  return (
    <box flexDirection="column" alignItems="center" gap={0}>
      {FORGE_ART.map((line) => (
        <text fg={primary}>{line}</text>
      ))}
      <text fg={muted}>{`               ${FORGE_TAGLINE}`}</text>
    </box>
  );
}

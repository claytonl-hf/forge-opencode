/** @jsxImportSource @opentui/solid */

import type { TuiPluginApi } from "@opencode-ai/plugin/tui";

import { createSignal, onCleanup } from "solid-js";

import type { TuiSlot } from "../../plugin/integrations/types";

import { openSessionInWeb } from "./bridge";

export function WebSlot(
  api: TuiPluginApi,
  web: { file: string; url?: string },
): TuiSlot<"sidebar_content"> {
  return (context, props) => {
    const [status, setStatus] = createSignal<"idle" | "sent" | "error">("idle");
    let timer: ReturnType<typeof setTimeout> | undefined;

    onCleanup(() => clearTimeout(timer));

    const open = (event: { stopPropagation: () => void }) => {
      event.stopPropagation();
      const result = openSessionInWeb(api, web.file, props.session_id, web.url);
      setStatus(result.ok ? "sent" : "error");
      api.ui.toast(
        result.ok
          ? {
              variant: "success",
              title: "Open in Forge",
              message: "Opening this session in Forge…",
              duration: 2000,
            }
          : {
              variant: "error",
              title: "Open in Forge",
              message: result.error,
              duration: 4000,
            },
      );
      clearTimeout(timer);
      timer = setTimeout(() => setStatus("idle"), result.ok ? 2000 : 4000);
    };

    const color = () =>
      status() === "error" ? context.theme.current.error : context.theme.current.textMuted;

    return (
      <box flexDirection="row" onMouseDown={open}>
        <text style={{ fg: color() }}>
          {status() === "sent"
            ? "Opening Forge…"
            : status() === "error"
              ? "Open failed"
              : "Open in Forge"}
        </text>
        {status() === "idle" && <text style={{ fg: context.theme.current.text }}> ↗</text>}
      </box>
    );
  };
}

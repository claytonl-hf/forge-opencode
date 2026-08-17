/** @jsxImportSource @opentui/solid */

import type { TuiSlotPlugin } from "@opencode-ai/plugin/tui";

import type { TuiSlot, TuiSlots } from "../integrations/types";

type SidebarSlot = TuiSlot<"sidebar_content">;

function ForgeSection(props: {
  context: Parameters<SidebarSlot>[0];
  slot: Parameters<SidebarSlot>[1];
  lines: SidebarSlot[];
}) {
  return (
    <box flexDirection="column">
      <text>
        <b style={{ fg: props.context.theme.current.primary }}>Forge</b>
      </text>
      {props.lines.map((line) => line(props.context, props.slot))}
    </box>
  );
}

export function createSidebar(contributions: TuiSlots[]): SidebarSlot | undefined {
  const lines = contributions.flatMap(({ sidebar_content: contribution }) =>
    Array.isArray(contribution) ? contribution : [],
  );
  const sections = contributions.flatMap(({ sidebar_content: contribution }) =>
    contribution && !Array.isArray(contribution) ? [contribution] : [],
  );

  if (lines.length > 0) {
    sections.unshift((context, slot) => (
      <ForgeSection context={context} slot={slot} lines={lines} />
    ));
  }
  if (sections.length === 0) return undefined;
  if (sections.length === 1) return sections[0];

  return (context, slot) => (
    <box flexDirection="column">
      {sections.map((section, index) => (
        <box flexDirection="column" marginTop={index === 0 ? 0 : 1}>
          {section(context, slot)}
        </box>
      ))}
    </box>
  );
}

export function sidebarPlugin(slot: SidebarSlot): TuiSlotPlugin {
  return { order: 350, slots: { sidebar_content: slot } };
}

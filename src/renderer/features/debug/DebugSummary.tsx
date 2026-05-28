import * as React from "react";
import { cn } from "@renderer/shared/lib/utils";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import type { SummaryTone } from "./debugHelpers";

export type DebugSummaryCard = {
  key: string;
  label: string;
  value: string;
  meta: string;
  tone: SummaryTone;
};

const TONE_DOT: Record<SummaryTone, string> = {
  ok: "var(--dp-signal-ok)",
  warn: "var(--dp-signal-warn)",
  error: "var(--dp-signal-err)",
  idle: "var(--dp-text-dimmer)",
};

const TONE_VALUE_COLOR: Record<SummaryTone, string> = {
  ok: "text-[color:var(--dp-signal-ok)]",
  warn: "text-[color:var(--dp-signal-warn)]",
  error: "text-[color:var(--dp-signal-err)]",
  idle: "text-[color:var(--dp-text)]",
};

export function DebugSummary({ cards }: { cards: DebugSummaryCard[] }) {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
    >
      {cards.map((card) => (
        <div
          key={card.key}
          className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-4 py-3.5"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-[6px] w-[6px] rounded-full"
              style={{ background: TONE_DOT[card.tone] }}
            />
            <SectionLabel inline>{card.label}</SectionLabel>
          </div>
          <div
            className={cn(
              "text-[18px] font-medium leading-tight truncate",
              TONE_VALUE_COLOR[card.tone],
            )}
          >
            {card.value}
          </div>
          <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] mt-1 truncate">
            {card.meta}
          </div>
        </div>
      ))}
    </div>
  );
}

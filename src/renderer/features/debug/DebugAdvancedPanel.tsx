import * as React from "react";
import { useI18n } from "@renderer/shared/i18n";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { Button } from "@renderer/shared/components/ui/button";
import { Input } from "@renderer/shared/components/ui/input";

export type DebugAdvancedPanelProps = {
  simDropId: string;
  setSimDropId: (val: string) => void;
  simProgress: string;
  setSimProgress: (val: string) => void;
  simBusy: boolean;
  onEmit: (kind: "drop-progress" | "drop-claim" | "notification") => void;
  copied: boolean;
  onCopy: () => void;
  snapshotLines: string[];
};

export function DebugAdvancedPanel(props: DebugAdvancedPanelProps) {
  const { t } = useI18n();
  return (
    <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-5 py-4">
      <SectionLabel>{t("debug.advanced.title")}</SectionLabel>
      <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] mt-1 mb-4">
        {t("debug.advanced.subtitle")}
      </div>

      <div className="flex flex-col gap-3">
        {/* PubSub simulator */}
        <details className="group" open>
          <summary className="cursor-pointer select-none rounded-[var(--dp-radius-sm)] bg-[color:var(--dp-bg-elevated-2)] border border-[color:var(--dp-border-soft)] px-3 py-2 font-mono text-[11px] text-[color:var(--dp-text-dim)] hover:text-[color:var(--dp-text)]">
            {t("debug.sim.title")}
          </summary>
          <div className="mt-3 flex flex-col gap-3 px-1">
            <p className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">{t("debug.sim.help")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                tone="dp"
                type="text"
                placeholder={t("debug.sim.dropId")}
                value={props.simDropId}
                onChange={(e) => props.setSimDropId(e.target.value)}
              />
              <Input
                tone="dp"
                type="number"
                min={0}
                placeholder={t("debug.sim.progress")}
                value={props.simProgress}
                onChange={(e) => props.setSimProgress(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="dp-outline"
                size="dp-sm"
                disabled={props.simBusy || props.simDropId.trim().length === 0}
                onClick={() => props.onEmit("drop-progress")}
              >
                {t("debug.sim.progressBtn")}
              </Button>
              <Button
                variant="dp-outline"
                size="dp-sm"
                disabled={props.simBusy || props.simDropId.trim().length === 0}
                onClick={() => props.onEmit("drop-claim")}
              >
                {t("debug.sim.claimBtn")}
              </Button>
              <Button
                variant="dp-outline"
                size="dp-sm"
                disabled={props.simBusy}
                onClick={() => props.onEmit("notification")}
              >
                {t("debug.sim.notificationBtn")}
              </Button>
            </div>
          </div>
        </details>

        {/* Snapshot viewer */}
        <details>
          <summary className="cursor-pointer select-none rounded-[var(--dp-radius-sm)] bg-[color:var(--dp-bg-elevated-2)] border border-[color:var(--dp-border-soft)] px-3 py-2 font-mono text-[11px] text-[color:var(--dp-text-dim)] hover:text-[color:var(--dp-text)] flex items-center justify-between gap-2">
            <span>{t("debug.snapshot")}</span>
            <Button
              variant="dp-outline"
              size="dp-sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                props.onCopy();
              }}
              type="button"
            >
              {props.copied ? t("debug.copied") : t("debug.copy")}
            </Button>
          </summary>
          <div className="mt-3 px-1">
            <p className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] mb-2">
              {t("debug.snapshotHelp")}
            </p>
            <ol
              className="rounded-[var(--dp-radius-md)] border border-[color:var(--dp-border-soft)] bg-[color:var(--dp-bg-elevated-2)] p-3 font-mono text-[10px] text-[color:var(--dp-text-dim)] overflow-x-auto"
              style={{ maxHeight: "420px", overflowY: "auto" }}
              aria-label={t("debug.snapshot")}
            >
              {props.snapshotLines.map((line, index) => (
                <li key={`${index}`} className="whitespace-pre">
                  {line || " "}
                </li>
              ))}
            </ol>
          </div>
        </details>
      </div>
    </div>
  );
}

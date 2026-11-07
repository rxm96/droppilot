import * as React from "react";
import { useI18n } from "@renderer/shared/i18n";
import { ChevronDown } from "@renderer/shared/lib/icons";
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

const FIELD_LABEL = "flex flex-col gap-1 font-mono text-[11px] text-[color:var(--dp-text-dimmer)]";
const HELP = "m-0 mb-2.5 text-[12px] leading-normal text-[color:var(--dp-text-dim)]";

/** Simulator and raw snapshot, collapsed by default: tools for reproducing a bug. */
export function DebugAdvancedPanel(props: DebugAdvancedPanelProps) {
  const { t } = useI18n();
  const dropIdId = React.useId();
  const progressId = React.useId();
  const noDropId = props.simDropId.trim().length === 0;

  return (
    <details className="group rounded-[var(--dp-radius-xl)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 select-none [&::-webkit-details-marker]:hidden">
        <ChevronDown
          size={14}
          strokeWidth={1.7}
          aria-hidden="true"
          className="flex-none -rotate-90 text-[color:var(--dp-text-dimmer)] transition-transform group-open:rotate-0"
        />
        <span className="text-[13px] font-semibold text-[color:var(--dp-text)]">
          {t("debug.advanced.title")}
        </span>
        <span className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
          · {t("debug.advanced.subtitle")}
        </span>
      </summary>

      <div className="grid gap-6 px-4 pb-4 pt-1 @min-[720px]:grid-cols-2">
        {/* PubSub simulator */}
        <div className="min-w-0">
          <p className={HELP}>{t("debug.sim.help")}</p>
          <div className="flex flex-wrap items-end gap-2">
            <label htmlFor={dropIdId} className={`${FIELD_LABEL} min-w-[160px] flex-[2]`}>
              {t("debug.sim.dropId")}
              <Input
                id={dropIdId}
                tone="dp"
                type="text"
                value={props.simDropId}
                onChange={(e) => props.setSimDropId(e.target.value)}
                className="bg-[color:var(--dp-bg-app)]"
              />
            </label>
            <label htmlFor={progressId} className={`${FIELD_LABEL} min-w-[96px] flex-1`}>
              {t("debug.sim.progress")}
              <Input
                id={progressId}
                tone="dp"
                type="number"
                min={0}
                value={props.simProgress}
                onChange={(e) => props.setSimProgress(e.target.value)}
                className="bg-[color:var(--dp-bg-app)]"
              />
            </label>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="dp-outline"
              size="dp-sm"
              disabled={props.simBusy || noDropId}
              onClick={() => props.onEmit("drop-progress")}
            >
              {t("debug.sim.progressBtn")}
            </Button>
            <Button
              type="button"
              variant="dp-outline"
              size="dp-sm"
              disabled={props.simBusy || noDropId}
              onClick={() => props.onEmit("drop-claim")}
            >
              {t("debug.sim.claimBtn")}
            </Button>
            <Button
              type="button"
              variant="dp-outline"
              size="dp-sm"
              disabled={props.simBusy}
              onClick={() => props.onEmit("notification")}
            >
              {t("debug.sim.notificationBtn")}
            </Button>
          </div>
        </div>

        {/* Snapshot */}
        <div className="min-w-0">
          <p className={HELP}>{t("debug.snapshotHelp")}</p>
          <Button type="button" variant="dp-outline" size="dp-sm" onClick={props.onCopy}>
            {props.copied ? t("debug.copied") : t("debug.copy")}
          </Button>
        </div>

        <ol
          className="col-span-full m-0 max-h-[420px] list-none overflow-auto rounded-[var(--dp-radius-md)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-app)] p-3 font-mono text-[11px] leading-normal text-[color:var(--dp-text-dim)]"
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
  );
}

import { cn } from "@renderer/shared/lib/utils";
import { useI18n } from "@renderer/shared/i18n";
import type { AutopilotState } from "@renderer/features/overview/overviewModel";

export type AutopilotChipProps = {
  state: AutopilotState;
  onToggle: () => void;
};

/** `● autopilot · running` / `paused` in the nav's right slot. Click toggles. */
export function AutopilotChip({ state, onToggle }: AutopilotChipProps) {
  const { t } = useI18n();
  const paused = state === "paused";
  const off = state === "off";
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={off}
      aria-pressed={!paused && !off}
      title={
        off
          ? t("autopilot.title.off")
          : paused
            ? t("autopilot.title.resume")
            : t("autopilot.title.pause")
      }
      className={cn(
        "inline-flex h-[30px] items-center gap-2 rounded-[var(--dp-radius-md)] border px-2.5 font-mono text-[12px] text-[color:var(--dp-text)] transition-colors hover:bg-[color:var(--dp-bg-elevated-2)] disabled:pointer-events-none disabled:opacity-60",
        paused
          ? "border-[color-mix(in_srgb,var(--dp-signal-warn)_40%,transparent)]"
          : "border-[color:var(--dp-border)]",
      )}
    >
      <span
        aria-hidden="true"
        className="h-[7px] w-[7px] rounded-full"
        style={{
          background: paused
            ? "var(--dp-signal-warn)"
            : off
              ? "var(--dp-text-dimmer)"
              : "var(--dp-signal-ok)",
        }}
      />
      {off
        ? t("autopilot.chip.off")
        : paused
          ? t("autopilot.chip.paused")
          : t("autopilot.chip.running")}
    </button>
  );
}

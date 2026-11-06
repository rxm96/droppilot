import { cn } from "@renderer/shared/lib/utils";
import { useI18n } from "@renderer/shared/i18n";
import type { DropStatus } from "@renderer/shared/domain/dropStatus";

const OUTLINE = "border border-[color:var(--dp-border)] text-[color:var(--dp-text-dim)]";

const PILL_CLASS: Record<DropStatus, string> = {
  watching: "bg-[color:var(--dp-accent-soft)] text-[color:var(--dp-accent)]",
  next: OUTLINE,
  queued: OUTLINE,
  "needs-link": "bg-[color:var(--dp-warn-soft)] text-[color:var(--dp-signal-warn)]",
  claim: "bg-[color:var(--dp-warn-soft)] text-[color:var(--dp-signal-warn)]",
  blocked: "border border-[color:var(--dp-border)] text-[color:var(--dp-text-dimmer)]",
  claimed:
    "bg-[color-mix(in_srgb,var(--dp-signal-ok)_10%,transparent)] text-[color:var(--dp-signal-ok)]",
  "not-farmed": "text-[color:var(--dp-text-dimmer)]",
  expired: "text-[color:var(--dp-text-dimmer)]",
};

const PILL_KEY: Record<DropStatus, string> = {
  watching: "dropStatus.watching",
  next: "dropStatus.next",
  queued: "dropStatus.queued",
  "needs-link": "dropStatus.needsLink",
  claim: "dropStatus.claim",
  blocked: "dropStatus.blocked",
  claimed: "dropStatus.claimed",
  "not-farmed": "dropStatus.notFarmed",
  expired: "dropStatus.expired",
};

/** The one status pill for drops (overview plan table, drops view, drop drawer). */
export function DropStatusPill({ status, title }: { status: DropStatus; title?: string }) {
  const { t } = useI18n();
  return (
    <span
      title={title}
      className={cn(
        "inline-block whitespace-nowrap rounded-[var(--dp-radius-xs)] px-2 py-[3px] font-mono text-[10px]",
        PILL_CLASS[status],
      )}
    >
      {t(PILL_KEY[status])}
    </span>
  );
}

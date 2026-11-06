import { cn } from "@renderer/shared/lib/utils";
import { useI18n } from "@renderer/shared/i18n";
import { formatBlockingReason } from "./engineVoice";
import type { PlanClock, PlanTable, PlanTableDropRow, PlanTableStatus } from "./planTable";

export type PlanPanelProps = {
  table: PlanTable;
  onOpenGames: () => void;
};

function Clock({ value }: { value: PlanClock }) {
  return (
    <>
      {value.clock}
      {value.dayOffset > 0 && (
        <sup className="ml-0.5 text-[9px] text-[color:var(--dp-text-dimmer)]">
          +{value.dayOffset}d
        </sup>
      )}
    </>
  );
}

const PILL_CLASS: Record<PlanTableStatus, string> = {
  watching: "bg-[color:var(--dp-accent-soft)] text-[color:var(--dp-accent)]",
  next: "border border-[color:var(--dp-border)] text-[color:var(--dp-text-dim)]",
  queued: "border border-[color:var(--dp-border)] text-[color:var(--dp-text-dim)]",
  "needs-link": "bg-[color:var(--dp-warn-soft)] text-[color:var(--dp-signal-warn)]",
  blocked: "border border-[color:var(--dp-border)] text-[color:var(--dp-text-dimmer)]",
};

const PILL_KEY: Record<PlanTableStatus, string> = {
  watching: "overview.status.watching",
  next: "overview.status.next",
  queued: "overview.status.queued",
  "needs-link": "overview.status.needsLink",
  blocked: "overview.status.blocked",
};

function DropRow({ row }: { row: PlanTableDropRow }) {
  const { t } = useI18n();
  const active = row.status === "watching";
  const blocked = row.ready === null;
  const note =
    row.note?.kind === "ends-first"
      ? t("overview.plan.note.endsFirst")
      : row.note?.kind === "ends-soon"
        ? t("overview.plan.note.endsSoon", { time: row.note.endsIn })
        : null;
  return (
    <tr
      className={cn(
        "border-t border-[color:var(--dp-border)] first:border-t-0",
        active && "bg-[color:var(--dp-accent-soft)] shadow-[inset_2px_0_0_var(--dp-accent)]",
      )}
    >
      <td
        className={cn(
          "px-[22px] py-3 font-mono tabular-nums",
          active
            ? "text-[color:var(--dp-text)]"
            : blocked
              ? "text-[color:var(--dp-text-dimmer)]"
              : "text-[color:var(--dp-text-dim)]",
        )}
      >
        {row.ready ? <Clock value={row.ready} /> : "—"}
      </td>
      <td className="py-3 pr-3">
        <div
          className={cn(
            "font-medium",
            blocked ? "text-[color:var(--dp-text-dim)]" : "text-[color:var(--dp-text)]",
          )}
        >
          {row.title}
        </div>
        <div className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
          {row.game.toLowerCase()}
          {note && (
            <span
              className={
                row.note?.kind === "ends-first" ? "text-[color:var(--dp-signal-warn)]" : undefined
              }
            >
              {" · "}
              {note}
            </span>
          )}
        </div>
      </td>
      <td
        className={cn(
          "py-3 font-mono tabular-nums",
          blocked ? "text-[color:var(--dp-text-dimmer)]" : "text-[color:var(--dp-text-dim)]",
        )}
      >
        {row.watched} / {row.required}
      </td>
      <td className="px-[22px] py-3 text-right">
        <span
          title={row.blockedReason ? formatBlockingReason(row.blockedReason, t) : undefined}
          className={cn(
            "whitespace-nowrap rounded-[var(--dp-radius-xs)] px-2 py-[3px] font-mono text-[10px]",
            PILL_CLASS[row.status],
          )}
        >
          {t(PILL_KEY[row.status])}
        </span>
      </td>
    </tr>
  );
}

/** "plan · today": when each drop will be ready, in farm order. */
export function PlanPanel({ table, onOpenGames }: PlanPanelProps) {
  const { t } = useI18n();
  return (
    <section
      aria-labelledby="plan-title"
      className="overflow-hidden rounded-[var(--dp-radius-xl)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--dp-border)] px-[22px] py-4 font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
        <h2 id="plan-title" className="m-0 text-[11px] font-normal">
          {t("overview.plan.header")}
        </h2>
        <span>
          {table.doneAt && (
            <>
              {t("overview.plan.doneBy")}{" "}
              <span className="text-[color:var(--dp-text)]">
                <Clock value={table.doneAt} />
              </span>
              {" · "}
            </>
          )}
          <button
            type="button"
            onClick={onOpenGames}
            className="text-[color:var(--dp-accent)] hover:text-[color:var(--dp-text)]"
          >
            {t("overview.plan.reorder")}
          </button>
        </span>
      </div>
      {table.rows.length === 0 ? (
        <div className="px-[22px] py-8 text-center text-[13px] text-[color:var(--dp-text-dimmer)]">
          {t("overview.plan.empty")}
        </div>
      ) : (
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-left font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
              <th className="px-[22px] py-2.5 font-normal">{t("overview.plan.col.ready")}</th>
              <th className="py-2.5 font-normal">{t("overview.plan.col.drop")}</th>
              <th className="py-2.5 font-normal">{t("overview.plan.col.watched")}</th>
              <th className="px-[22px] py-2.5 text-right font-normal">
                {t("overview.plan.col.status")}
              </th>
            </tr>
          </thead>
          <tbody className="border-t border-[color:var(--dp-border)]">
            {table.rows.map((row) =>
              row.kind === "switch" ? (
                <tr key={row.key} className="border-t border-[color:var(--dp-border)]">
                  <td
                    colSpan={4}
                    className="bg-[color:var(--dp-bg-app)] px-[22px] py-2 font-mono text-[11px] text-[color:var(--dp-text-dimmer)]"
                  >
                    {t(row.ranked ? "overview.plan.switchRanked" : "overview.plan.switchUnranked", {
                      game: row.game.toLowerCase(),
                    })}
                  </td>
                </tr>
              ) : (
                <DropRow key={row.key} row={row} />
              ),
            )}
          </tbody>
        </table>
      )}
      {table.hiddenCount > 0 && (
        <div className="border-t border-[color:var(--dp-border)] px-[22px] py-2.5 text-center font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
          {t("overview.plan.more", { count: table.hiddenCount })}
        </div>
      )}
    </section>
  );
}

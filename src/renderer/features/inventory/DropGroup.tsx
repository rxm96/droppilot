import * as React from "react";
import type { DropStatus } from "@renderer/shared/domain/dropStatus";
import { DropStatusPill } from "@renderer/shared/components/DropStatusPill";
import { GameTile } from "@renderer/shared/components/GameTile";
import { Button } from "@renderer/shared/components/ui/button";
import { ChevronDown, ExternalLink } from "@renderer/shared/lib/icons";
import { cn } from "@renderer/shared/lib/utils";
import { useI18n } from "@renderer/shared/i18n";
import type { CampaignSummary } from "@renderer/shared/types";
import { formatBlockingReason } from "@renderer/features/overview/engineVoice";
import { PlanClockText } from "@renderer/features/overview/PlanClockText";
import { formatRank, type DropNote, type DropsGroup, type DropsRow } from "./dropsModel";
import { DropDetailsRow } from "./DropDetailsRow";

export type DropGroupProps = {
  group: DropsGroup;
  /** The drop whose details strip is open (one at a time). */
  openDropId: string | null;
  onToggleDrop: (id: string) => void;
  campaigns: CampaignSummary[];
  /** The user's ranked games (resolvePriorityGameNames). */
  rankedGames: string[];
  /** The game of the drop being watched right now; null while nothing is. */
  farmingGame: string | null;
  /** Group actions (add to games, link account); off in the expired section. */
  actions: boolean;
  onAddPriorityGame: (game: string) => void;
  onOpenAccountLink: (url?: string) => void;
};

const BAR_COLOR: Record<DropStatus, string> = {
  watching: "var(--dp-accent)",
  next: "var(--dp-text-dimmer)",
  queued: "var(--dp-text-dimmer)",
  "needs-link": "var(--dp-signal-warn)",
  claim: "var(--dp-signal-warn)",
  blocked: "var(--dp-text-dimmer)",
  claimed: "var(--dp-signal-ok)",
  "not-farmed": "color-mix(in srgb, var(--dp-text-dimmer) 50%, transparent)",
  expired: "color-mix(in srgb, var(--dp-text-dimmer) 50%, transparent)",
};

const QUIET: ReadonlySet<DropStatus> = new Set(["blocked", "claimed", "not-farmed", "expired"]);
const FADED: ReadonlySet<DropStatus> = new Set(["not-farmed", "expired"]);

type Translator = (key: string, vars?: Record<string, string | number>) => string;

function noteText(note: DropNote, t: Translator): string | null {
  if (!note) return null;
  switch (note.kind) {
    case "on-channel":
      return t("drops.note.onChannel", { channel: note.channel });
    case "after-switch":
      return t("drops.note.afterSwitch", {
        time: note.at.dayOffset > 0 ? `${note.at.clock} +${note.at.dayOffset}d` : note.at.clock,
      });
    case "ends-first":
      return t("overview.plan.note.endsFirst");
    case "ends-soon":
      return t("overview.plan.note.endsSoon", { time: note.endsIn });
    case "link":
      return t("drops.note.link", { game: note.game });
    case "claim":
      return t("drops.note.claim");
    case "blocked":
      return formatBlockingReason(note.reason, t);
    case "waiting-claim":
      return t("drops.note.waitingClaim");
    case "no-watch":
      return t("drops.note.noWatch");
  }
}

type RowProps = Pick<
  DropGroupProps,
  "campaigns" | "rankedGames" | "farmingGame" | "onAddPriorityGame" | "onOpenAccountLink"
> & {
  row: DropsRow;
  code: string;
  open: boolean;
  onToggle: (id: string) => void;
};

function Row({ row, code, open, onToggle, ...detailsProps }: RowProps) {
  const { t } = useI18n();
  const detailsId = React.useId();
  const pct = row.required > 0 ? Math.min(100, Math.round((row.watched / row.required) * 100)) : 0;
  const note = noteText(row.note, t);
  const faded = FADED.has(row.status);
  // The whole row is a mouse target; keyboard and screen readers use the
  // title button, which carries the name and the expanded state.
  return (
    <>
      <tr
        onClick={() => onToggle(row.id)}
        className={cn(
          "cursor-pointer border-t border-[color:var(--dp-border)] transition-colors first:border-t-0 hover:bg-[color:var(--dp-bg-elevated-2)]",
          row.status === "watching"
            ? "bg-[color:var(--dp-accent-soft)] shadow-[inset_2px_0_0_var(--dp-accent)]"
            : open && "bg-[color:var(--dp-bg-elevated-2)]",
        )}
      >
        <td className="w-[52px] py-2.5 pl-[18px] pr-0">
          <GameTile url={row.imageUrl} code={code} size={34} faded={faded} />
        </td>
        <td className="py-2.5 pl-3">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(row.id);
            }}
            className={cn(
              "block max-w-full rounded-[var(--dp-radius-xs)] text-left font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--dp-accent)]",
              QUIET.has(row.status)
                ? "text-[color:var(--dp-text-dim)]"
                : "text-[color:var(--dp-text)]",
            )}
          >
            {row.title}
          </button>
          {note && (
            <div
              className={cn(
                "font-mono text-[11px]",
                row.note?.kind === "ends-first"
                  ? "text-[color:var(--dp-signal-warn)]"
                  : "text-[color:var(--dp-text-dimmer)]",
              )}
            >
              {note}
            </div>
          )}
        </td>
        <td className="w-[30%] px-6 py-2.5">
          <div className="h-1 overflow-hidden rounded-[2px] bg-[color:var(--dp-border)]">
            <div
              className="h-full rounded-[2px]"
              style={{ width: `${pct}%`, background: BAR_COLOR[row.status] }}
            />
          </div>
          <div className="mt-1.5 font-mono text-[11px] tabular-nums text-[color:var(--dp-text-dimmer)]">
            {t("drops.minutes", { watched: row.watched, required: row.required })}
          </div>
        </td>
        <td className="w-[76px] py-2.5 font-mono tabular-nums text-[color:var(--dp-text-dim)]">
          {row.ready ? <PlanClockText value={row.ready} /> : "—"}
        </td>
        <td className="w-[160px] py-2.5 pr-[18px]">
          <div className="flex items-center justify-end gap-2.5">
            <DropStatusPill
              status={row.status}
              title={
                row.note?.kind === "blocked" ? formatBlockingReason(row.note.reason, t) : undefined
              }
            />
            <ChevronDown
              aria-hidden="true"
              size={14}
              strokeWidth={1.7}
              className={cn(
                "flex-none text-[color:var(--dp-text-dimmer)] transition-transform",
                open && "rotate-180",
              )}
            />
          </div>
        </td>
      </tr>
      {open && (
        <DropDetailsRow id={detailsId} row={row} code={code} faded={faded} {...detailsProps} />
      )}
    </>
  );
}

/** One game: header (tile, name, rank, campaign, ends in, actions) and its drops. */
export function DropGroup({
  group,
  openDropId,
  onToggleDrop,
  campaigns,
  rankedGames,
  farmingGame,
  actions,
  onAddPriorityGame,
  onOpenAccountLink,
}: DropGroupProps) {
  const { t, language } = useI18n();
  const meta = [
    group.rank !== null
      ? t("drops.group.rank", { rank: formatRank(group.rank, language) })
      : t("drops.group.notRanked"),
    group.campaign?.kind === "one"
      ? group.campaign.name
      : group.campaign?.kind === "many"
        ? t("drops.group.campaigns", { count: group.campaign.count })
        : null,
    group.endsIn ? t("drops.group.endsIn", { time: group.endsIn }) : null,
  ].filter(Boolean);
  const headingId = React.useId();
  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-[var(--dp-radius-xl)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)]"
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-[color:var(--dp-border)] px-[18px] py-3">
        <GameTile url={group.imageUrl} code={group.code} size={30} />
        <h2 id={headingId} className="m-0 text-[14px] font-semibold text-[color:var(--dp-text)]">
          {group.game}
        </h2>
        <span className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
          {meta.join(" · ")}
        </span>
        {actions && (group.needsLink || group.rank === null) && (
          <div className="ml-auto flex flex-wrap gap-2">
            {group.needsLink && (
              <Button
                variant="dp-outline"
                size="dp-sm"
                className="border-[color-mix(in_srgb,var(--dp-signal-warn)_40%,transparent)] text-[color:var(--dp-signal-warn)] hover:bg-[color:var(--dp-warn-soft)]"
                onClick={() => onOpenAccountLink(group.linkUrl)}
                title={group.linkUrl}
              >
                <ExternalLink size={11} strokeWidth={1.8} /> {t("drops.group.link")}
              </Button>
            )}
            {group.rank === null && (
              <Button
                variant="dp-outline"
                size="dp-sm"
                onClick={() => onAddPriorityGame(group.game.trim())}
              >
                {t("drops.group.add")}
              </Button>
            )}
          </div>
        )}
      </header>
      <table className="w-full border-collapse text-[13px]">
        <tbody>
          {group.rows.map((row) => (
            <Row
              key={row.id}
              row={row}
              code={group.code}
              open={row.id === openDropId}
              onToggle={onToggleDrop}
              campaigns={campaigns}
              rankedGames={rankedGames}
              farmingGame={farmingGame}
              onAddPriorityGame={onAddPriorityGame}
              onOpenAccountLink={onOpenAccountLink}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}

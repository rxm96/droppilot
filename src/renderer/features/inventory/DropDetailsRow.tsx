import * as React from "react";
import type { CampaignSummary } from "@renderer/shared/types";
import { GameTile } from "@renderer/shared/components/GameTile";
import { Button } from "@renderer/shared/components/ui/button";
import { ExternalLink } from "@renderer/shared/lib/icons";
import { cn } from "@renderer/shared/lib/utils";
import { useI18n, type Language } from "@renderer/shared/i18n";
import { formatBlockingReason } from "@renderer/features/overview/engineVoice";
import { formatPercent } from "@renderer/features/overview/formatters";
import { PlanClockText } from "@renderer/features/overview/PlanClockText";
import {
  buildDropDetails,
  formatMinutesLeft,
  type DropAction,
  type ReadyReason,
  type WhyPart,
} from "./dropDetails";
import type { DropsRow } from "./dropsModel";

type Translator = (key: string, vars?: Record<string, string | number>) => string;

// en-GB for English: "Sat 9 Nov, 18:00" with the 24h clock the app uses everywhere.
const DATE_LOCALE: Record<Language, string> = { en: "en-GB", de: "de-DE" };

function dateFormatter(language: Language): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(DATE_LOCALE[language] ?? "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

function whyText(
  parts: WhyPart[],
  t: Translator,
  language: Language,
  formatDate: (ts: number) => string,
): string {
  // Blocking reasons are written as labels ("Account not linked"); mid-sentence
  // English wants them lowercase. German keeps the case (nouns stay capitalised).
  const reasonText = (hint: string) => {
    const text = formatBlockingReason(hint, t);
    return language === "en" ? text.charAt(0).toLowerCase() + text.slice(1) : text;
  };
  return parts
    .map((part) => {
      const vars: Record<string, string | number> = {};
      for (const [name, value] of Object.entries(part.vars ?? {})) {
        if (typeof value === "string" || typeof value === "number") vars[name] = value;
        else if (value.kind === "date") vars[name] = formatDate(value.at);
        else vars[name] = reasonText(value.hint);
      }
      return t(part.key, vars);
    })
    .join(" ");
}

const READY_REASON_KEY: Record<ReadyReason, string> = {
  watched: "drops.details.ready.watched",
  claim: "drops.details.ready.claim",
  link: "drops.details.ready.link",
  blocked: "drops.details.ready.blocked",
  "not-farmed": "drops.details.ready.notFarmed",
  claimed: "drops.details.ready.claimed",
  expired: "drops.details.ready.expired",
};

function Fact({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="min-w-0">
      <dt className="mb-1 font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">{label}</dt>
      <dd className="m-0 truncate font-mono text-[13px] tabular-nums text-[color:var(--dp-text)]">
        {value}
      </dd>
      {sub && (
        <dd className="m-0 mt-0.5 truncate font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
          {sub}
        </dd>
      )}
    </div>
  );
}

export type DropDetailsRowProps = {
  /** The details row's id; the row's title button points at it (aria-controls). */
  id: string;
  row: DropsRow;
  code: string;
  faded: boolean;
  campaigns: CampaignSummary[];
  rankedGames: string[];
  farmingGame: string | null;
  onAddPriorityGame: (game: string) => void;
  onOpenAccountLink: (url?: string) => void;
};

/** The inline details strip under an open drop row: image, why + facts, actions. */
export function DropDetailsRow({
  id,
  row,
  code,
  faded,
  campaigns,
  rankedGames,
  farmingGame,
  onAddPriorityGame,
  onOpenAccountLink,
}: DropDetailsRowProps) {
  const { t, language } = useI18n();
  const details = React.useMemo(
    () => buildDropDetails(row, { campaigns, rankedGames, farmingGame, now: Date.now() }),
    [campaigns, farmingGame, rankedGames, row],
  );
  const formatter = React.useMemo(() => dateFormatter(language), [language]);
  const formatDate = (ts: number) => formatter.format(ts);
  const { watched, ready, campaign, ends } = details.facts;

  const actionButton = (action: DropAction) => {
    switch (action.kind) {
      case "link":
        return (
          <Button
            key="link"
            variant="dp-primary"
            size="dp-md"
            className="w-full"
            title={action.url}
            onClick={() => onOpenAccountLink(action.url)}
          >
            <ExternalLink size={11} strokeWidth={1.8} /> {t("drops.details.action.link")}
          </Button>
        );
      case "add-game":
        return (
          <Button
            key="add-game"
            variant="dp-primary"
            size="dp-md"
            className="w-full"
            onClick={() => onAddPriorityGame(action.game)}
          >
            {t("drops.details.action.add")}
          </Button>
        );
      case "inventory":
      case "campaign":
        return (
          <Button
            key={action.kind}
            variant="dp-outline"
            size="dp-md"
            className="w-full"
            title={action.url}
            onClick={() => onOpenAccountLink(action.url)}
          >
            <ExternalLink size={11} strokeWidth={1.8} />{" "}
            {t(
              action.kind === "inventory"
                ? "drops.details.action.inventory"
                : "drops.details.action.campaign",
            )}
          </Button>
        );
    }
  };

  return (
    <tr
      id={id}
      className={cn(
        "border-t border-dashed border-[color:var(--dp-border)]",
        row.status === "watching"
          ? "bg-[color:var(--dp-accent-soft)] shadow-[inset_2px_0_0_var(--dp-accent)]"
          : "bg-[color:var(--dp-bg-elevated-2)]",
      )}
    >
      <td colSpan={5} className="px-[18px] pb-5 pt-1.5">
        <div className="grid grid-cols-[104px_minmax(0,1fr)_200px] gap-5 pt-3.5">
          <div>
            <GameTile url={row.imageUrl} code={code} size={88} faded={faded} />
          </div>
          <div className="min-w-0">
            <p className="m-0 mb-4 max-w-[640px] text-[14px] leading-[1.55] text-[color:var(--dp-text)]">
              {whyText(details.why, t, language, formatDate)}
            </p>
            <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-3.5 lg:grid-cols-4">
              <Fact
                label={t("drops.details.fact.watched")}
                value={t("drops.minutes", {
                  watched: watched.watched,
                  required: watched.required,
                })}
                sub={watched.percent === null ? undefined : formatPercent(watched.percent)}
              />
              <Fact
                label={t("drops.details.fact.ready")}
                value={ready.kind === "at" ? <PlanClockText value={ready.clock} /> : "—"}
                sub={
                  ready.kind === "none"
                    ? t(READY_REASON_KEY[ready.reason])
                    : ready.minutesLeft === null
                      ? undefined
                      : ready.minutesLeft <= 0
                        ? t("drops.details.ready.soon")
                        : t("drops.details.ready.in", {
                            time: formatMinutesLeft(ready.minutesLeft),
                          })
                }
              />
              <Fact
                label={t("drops.details.fact.campaign")}
                value={campaign ? <span title={campaign.name}>{campaign.name}</span> : "—"}
                sub={
                  campaign?.dropCount
                    ? t(
                        campaign.dropCount === 1
                          ? "drops.details.dropCount.one"
                          : "drops.details.dropCount.other",
                        { count: campaign.dropCount },
                      )
                    : undefined
                }
              />
              <Fact
                label={t("drops.details.fact.ends")}
                value={ends ? formatDate(ends.at) : "—"}
                sub={
                  ends
                    ? ends.endsIn
                      ? t("drops.details.ends.in", { time: ends.endsIn })
                      : t("drops.details.ends.ended")
                    : undefined
                }
              />
            </dl>
          </div>
          <div className="flex flex-col gap-2">{details.actions.map(actionButton)}</div>
        </div>
      </td>
    </tr>
  );
}

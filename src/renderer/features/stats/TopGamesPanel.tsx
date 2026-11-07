import * as React from "react";
import { useI18n } from "@renderer/shared/i18n";
import { topGames } from "./statsDerive";

export type TopGamesPanelProps = {
  claimsByGame: Record<string, number>;
};

/** Top five games by drops claimed, as bars. */
export function TopGamesPanel({ claimsByGame }: TopGamesPanelProps) {
  const { t } = useI18n();
  const headingId = React.useId();
  const rows = topGames(claimsByGame, 5);
  const max = rows[0]?.claims || 1;

  return (
    <section
      aria-labelledby={headingId}
      className="min-w-0 rounded-[var(--dp-radius-xl)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-5 py-[18px]"
    >
      <h2
        id={headingId}
        className="m-0 mb-3.5 font-mono text-[11px] font-normal text-[color:var(--dp-text-dimmer)]"
      >
        {t("stats.topGames.title")}
      </h2>
      {rows.length === 0 ? (
        <p className="m-0 text-[13px] text-[color:var(--dp-text-dimmer)]">
          {t("stats.topGames.empty")}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0 text-[13px]">
          {rows.map((row) => (
            <li
              key={row.name}
              className="grid grid-cols-[120px_minmax(0,1fr)_28px] items-center gap-2.5"
            >
              <span className="truncate text-[color:var(--dp-text)]" title={row.name}>
                {row.name}
              </span>
              <span className="h-1 rounded-[2px] bg-[color:var(--dp-border)]">
                <span
                  className="block h-full rounded-[2px] bg-[color:var(--dp-accent)]"
                  style={{ width: `${(row.claims / max) * 100}%` }}
                />
              </span>
              <span className="text-right font-mono tabular-nums text-[color:var(--dp-text)]">
                {row.claims}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

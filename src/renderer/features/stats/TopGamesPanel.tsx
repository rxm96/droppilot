import { useI18n } from "@renderer/shared/i18n";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { topGames } from "./statsDerive";

export type TopGamesPanelProps = {
  claimsByGame: Record<string, number>;
};

export function TopGamesPanel({ claimsByGame }: TopGamesPanelProps) {
  const { t } = useI18n();
  const rows = topGames(claimsByGame, 5);
  const max = rows[0]?.claims || 1;

  return (
    <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-4 py-4">
      <SectionLabel className="mb-4">{t("stats.topGames.title")}</SectionLabel>

      {rows.length === 0 ? (
        <p className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
          {t("stats.topGames.empty")}
        </p>
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => (
            <div key={row.name} className="flex items-center gap-3">
              <span
                className="w-28 shrink-0 truncate font-mono text-[11px] text-[color:var(--dp-text-dim)]"
                title={row.name}
              >
                {row.name}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[color:var(--dp-bg-app)]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(row.claims / max) * 100}%`,
                    background:
                      "linear-gradient(90deg, color-mix(in srgb, var(--dp-accent) 70%, transparent), var(--dp-accent))",
                  }}
                />
              </div>
              <span
                className="w-8 shrink-0 text-right font-mono text-[11px] text-[color:var(--dp-text)]"
                style={{ fontFeatureSettings: '"tnum"' }}
              >
                {row.claims}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

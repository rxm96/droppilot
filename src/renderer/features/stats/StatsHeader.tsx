import { useI18n } from "@renderer/shared/i18n";

export type StatsHeaderProps = {
  lastReset: number;
};

const DAY_MS = 86_400_000;

/** Title and "since <date> · N days". Resetting lives in Settings › advanced. */
export function StatsHeader({ lastReset }: StatsHeaderProps) {
  const { t, language } = useI18n();
  const date = new Date(lastReset).toLocaleDateString(language, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const days = Math.max(0, Math.floor((Date.now() - lastReset) / DAY_MS));

  return (
    <div>
      <h1 className="m-0 text-[22px] font-semibold text-[color:var(--dp-text)]">
        {t("stats.title")}
      </h1>
      <div className="mt-1 font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
        {t("stats.countingSince", { date, days })}
      </div>
    </div>
  );
}

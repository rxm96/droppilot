import type { ErrorInfo, ProfileState } from "@renderer/shared/types";
import { formatRemaining } from "@renderer/shared/utils";
import { useI18n } from "@renderer/shared/i18n";
import { useEffect, useState } from "react";
import { WATCH_INTERVAL_MS } from "@renderer/shared/hooks/useWatchPing";

type HeroProps = {
  demoMode?: boolean;
  profile: ProfileState;
  nextWatchAt?: number;
  watchError?: ErrorInfo | null;
  activeGame?: string;
  dropsTotal?: number;
  dropsClaimed?: number;
  targetProgress?: number;
  warmupActive?: boolean;
  warmupGame?: string;
};

export function Hero({
  demoMode,
  profile,
  nextWatchAt,
  watchError,
  activeGame,
  dropsTotal,
  dropsClaimed,
  targetProgress,
  warmupActive,
  warmupGame,
}: HeroProps) {
  const { t } = useI18n();
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    if (!nextWatchAt) {
      setNowTick(Date.now());
      return;
    }
    const timer = window.setInterval(() => setNowTick(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [nextWatchAt]);

  const dropProgress =
    typeof dropsTotal === "number" && typeof dropsClaimed === "number"
      ? `${dropsClaimed}/${dropsTotal}`
      : "--";

  const showLoginLine =
    profile.status === "ready" &&
    profile.login &&
    profile.displayName &&
    profile.displayName.toLowerCase() !== profile.login.toLowerCase();

  const displayName = profile.status === "ready" ? profile.displayName : "";
  const login = profile.status === "ready" ? profile.login : "";

  const progressPct = typeof targetProgress === "number" ? `${Math.round(targetProgress)}%` : "--";
  const nextWatchIn =
    typeof nextWatchAt === "number"
      ? Math.max(0, Math.round((nextWatchAt - nowTick) / 1000))
      : null;
  const nextWatchLabel = typeof nextWatchIn === "number" ? formatRemaining(nextWatchIn) : "--";
  const nextWatchPct =
    typeof nextWatchAt === "number"
      ? Math.min(
          100,
          Math.max(0, Math.round((1 - (nextWatchAt - nowTick) / WATCH_INTERVAL_MS) * 100)),
        )
      : null;
  const warmupLabel = warmupActive
    ? warmupGame
      ? t("hero.warmup", { game: warmupGame })
      : t("hero.warmupActive")
    : "";

  return (
    <header className="rounded-xl border border-border bg-card p-5 text-foreground shadow-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="m-0 text-2xl font-semibold tracking-tight">{t("hero.title")}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {warmupLabel ? (
              <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                {warmupLabel}
              </span>
            ) : null}
            {demoMode ? (
              <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
                {t("hero.demoMode")}
              </span>
            ) : null}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-background p-4 shadow-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("hero.activeCampaign")}
            </div>
            <div className="mt-2 text-lg font-semibold text-foreground">
              {activeGame || t("hero.noTarget")}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {t("hero.nextPing", { time: nextWatchLabel })}
              {watchError ? ` | ${t("hero.pingError")}` : ""}
            </div>
            {nextWatchPct !== null ? (
              <div className="mt-3 h-1.5 rounded-full bg-muted" aria-hidden="true">
                <span
                  className="block h-full rounded-full bg-primary transition-[width] duration-500"
                  style={{ width: `${nextWatchPct}%` }}
                />
              </div>
            ) : null}
          </div>
          <div className="rounded-lg border border-border bg-background p-4 shadow-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("hero.drops")}
            </div>
            <div className="mt-2 text-lg font-semibold text-foreground">{dropProgress}</div>
            <div className="mt-2 text-xs text-muted-foreground">
              {t("hero.targetProgress")}: {progressPct}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-background p-4 shadow-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("hero.account")}
            </div>
            {profile.status === "ready" ? (
              <div className="mt-3 flex items-center gap-3">
                {profile.avatar ? (
                  <img
                    src={profile.avatar}
                    alt=""
                    className="h-9 w-9 rounded-full border border-border object-cover"
                  />
                ) : null}
                <div>
                  <div className="text-sm font-medium text-foreground">{displayName}</div>
                  {showLoginLine ? (
                    <div className="text-xs text-muted-foreground">@{login}</div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="mt-2 text-xs text-muted-foreground">
                {profile.status === "loading" ? t("hero.profileLoading") : t("hero.profileIdle")}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

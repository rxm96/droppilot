import * as React from "react";
import { Button } from "@renderer/shared/components/ui/button";
import { ExternalLink } from "@renderer/shared/lib/icons";
import { useI18n } from "@renderer/shared/i18n";
import type { NeedsYouItem } from "./overviewModel";

export type NeedsYouPanelProps = {
  items: NeedsYouItem[];
  onClaimNow: () => void | Promise<void>;
  onRelogin: () => void;
  onOpenLink: (url?: string) => void;
};

const WARN_BUTTON =
  "self-start border-[color-mix(in_srgb,var(--dp-signal-warn)_40%,transparent)] text-[color:var(--dp-signal-warn)] hover:bg-[color:var(--dp-warn-soft)] hover:border-[color-mix(in_srgb,var(--dp-signal-warn)_60%,transparent)]";

/** Amber panel, rendered only when something needs the user. */
export function NeedsYouPanel({ items, onClaimNow, onRelogin, onOpenLink }: NeedsYouPanelProps) {
  const { t } = useI18n();
  const [claiming, setClaiming] = React.useState(false);
  const handleClaim = React.useCallback(async () => {
    if (claiming) return;
    setClaiming(true);
    try {
      await onClaimNow();
    } finally {
      setClaiming(false);
    }
  }, [claiming, onClaimNow]);

  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="needs-you-title"
      className="flex flex-col gap-4 rounded-[var(--dp-radius-xl)] border border-[color-mix(in_srgb,var(--dp-signal-warn)_25%,transparent)] px-5 py-[18px]"
      style={{
        background:
          "linear-gradient(var(--dp-warn-soft), var(--dp-warn-soft)), var(--dp-bg-elevated)",
      }}
    >
      <div
        id="needs-you-title"
        className="font-mono text-[11px] text-[color:var(--dp-signal-warn)]"
      >
        {t("overview.needsYou.kicker")}
      </div>
      {items.map((item) => {
        switch (item.kind) {
          case "session-expired":
            return (
              <div key="session" className="flex flex-col gap-2.5">
                <h2 className="m-0 text-[15px] font-semibold text-[color:var(--dp-text)]">
                  {t("overview.needsYou.session.title")}
                </h2>
                <p className="m-0 text-[13px] leading-normal text-[color:var(--dp-text-dim)]">
                  {t("overview.needsYou.session.body")}
                </p>
                <Button
                  variant="dp-outline"
                  size="dp-lg"
                  className={WARN_BUTTON}
                  onClick={onRelogin}
                >
                  {t("session.expired.relogin")}
                </Button>
              </div>
            );
          case "claim":
            return (
              <div key="claim" className="flex flex-col gap-2.5">
                <h2 className="m-0 text-[15px] font-semibold text-[color:var(--dp-text)]">
                  {item.count === 1
                    ? t("overview.needsYou.claim.title.one")
                    : t("overview.needsYou.claim.title.other", { count: item.count })}
                </h2>
                <p className="m-0 text-[13px] leading-normal text-[color:var(--dp-text-dim)]">
                  {t("overview.needsYou.claim.body")}
                </p>
                <Button
                  variant="dp-outline"
                  size="dp-lg"
                  className={WARN_BUTTON}
                  onClick={handleClaim}
                  disabled={claiming}
                >
                  {claiming ? t("hero.button.claiming") : t("overview.needsYou.claim.action")}
                </Button>
              </div>
            );
          case "link":
            return (
              <div key={`link:${item.game}`} className="flex flex-col gap-2.5">
                <h2 className="m-0 text-[15px] font-semibold text-[color:var(--dp-text)]">
                  {item.moreCount > 0
                    ? t("overview.needsYou.link.titleMore", {
                        game: item.game,
                        drop: item.dropTitle,
                        count: item.moreCount,
                      })
                    : t("overview.needsYou.link.title", { game: item.game, drop: item.dropTitle })}
                </h2>
                <p className="m-0 text-[13px] leading-normal text-[color:var(--dp-text-dim)]">
                  {t("overview.needsYou.link.body", { game: item.game })}
                </p>
                <Button
                  variant="dp-outline"
                  size="dp-lg"
                  className={WARN_BUTTON}
                  onClick={() => onOpenLink(item.linkUrl)}
                  title={item.linkUrl}
                >
                  {t("overview.needsYou.link.action")}
                  <ExternalLink size={14} strokeWidth={1.7} />
                </Button>
              </div>
            );
        }
      })}
    </section>
  );
}

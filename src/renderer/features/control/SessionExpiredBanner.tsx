import * as React from "react";
import type { AuthState } from "@renderer/shared/types";
import { Button } from "@renderer/shared/components/ui/button";
import { useI18n } from "@renderer/shared/i18n";

export type SessionExpiredBannerProps = {
  auth: AuthState;
  onRelogin: () => void;
};

/**
 * Persistent, non-blocking strip shown only when the session expired. Keeps the
 * dashboard mounted and offers an in-place re-login instead of the silent bounce
 * to a signed-out shell.
 */
export function SessionExpiredBanner({ auth, onRelogin }: SessionExpiredBannerProps) {
  const { t } = useI18n();
  if (auth.status !== "expired") return null;

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 border-b border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-5 py-2.5"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          aria-hidden="true"
          className="inline-block h-[6px] w-[6px] flex-shrink-0 rounded-full"
          style={{ background: "var(--dp-signal-warn)", boxShadow: "0 0 6px rgba(251,191,36,0.5)" }}
        />
        <span className="truncate text-[13px] text-[color:var(--dp-text)]">
          {t("session.expired.title")}
        </span>
      </div>
      <Button variant="dp-primary" size="dp-sm" onClick={onRelogin} className="flex-shrink-0">
        {t("session.expired.relogin")}
      </Button>
    </div>
  );
}

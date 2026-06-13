import { useCallback } from "react";
import type { Language } from "@renderer/shared/i18n";
import { translate } from "@renderer/shared/i18n";
import { recordActivity } from "@renderer/shared/utils/activityFeed";
import type { ActivityEvent } from "@renderer/shared/utils/activityFeed";
import type { AlertEventType } from "@renderer/shared/domain/alerts/alertRouting";

type NotifyFn = (payload: {
  type?: AlertEventType;
  key: string;
  title: string;
  body?: string;
  dedupeMs?: number;
  force?: boolean;
}) => void;

type Params = {
  language: Language;
  notify: NotifyFn;
  bumpStats: (delta: { claims?: number; lastDropTitle?: string; lastGame?: string }) => void;
};

export function useDropClaimAlerts({ language, notify, bumpStats }: Params) {
  const handleDropClaimed = useCallback(
    ({ title, game }: { title: string; game: string }) => {
      bumpStats({ claims: 1, lastDropTitle: title, lastGame: game });
      recordActivity({ kind: "drop-claimed", at: Date.now(), title, game } as Omit<
        Extract<ActivityEvent, { kind: "drop-claimed" }>,
        "id"
      >);
      notify({
        type: "drop-claimed",
        key: `drop-claimed:${title}:${game}`,
        title: translate(language, "alerts.title.dropClaimed"),
        body: translate(language, "alerts.body.dropClaimed", { title, game }),
        dedupeMs: 60_000,
      });
    },
    [bumpStats, language, notify],
  );

  const handleTestAlert = useCallback(() => {
    notify({
      key: "test-alert",
      title: translate(language, "alerts.title.test"),
      body: translate(language, "alerts.body.test"),
      dedupeMs: 0,
      force: true,
    });
  }, [language, notify]);

  return { handleDropClaimed, handleTestAlert };
}

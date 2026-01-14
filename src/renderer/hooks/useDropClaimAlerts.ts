import { useCallback } from "react";
import { translate } from "../i18n";

type NotifyFn = (payload: {
  key: string;
  title: string;
  body?: string;
  dedupeMs?: number;
  force?: boolean;
}) => void;

type Params = {
  language: string;
  alertsDropClaimed: boolean;
  notify: NotifyFn;
  bumpStats: (delta: { claims?: number; lastDropTitle?: string; lastGame?: string }) => void;
};

export function useDropClaimAlerts({ language, alertsDropClaimed, notify, bumpStats }: Params) {
  const handleDropClaimed = useCallback(
    ({ title, game }: { title: string; game: string }) => {
      bumpStats({ claims: 1, lastDropTitle: title, lastGame: game });
      if (!alertsDropClaimed) return;
      notify({
        key: `drop-claimed:${title}:${game}`,
        title: translate(language, "alerts.title.dropClaimed"),
        body: translate(language, "alerts.body.dropClaimed", { title, game }),
        dedupeMs: 60_000,
      });
    },
    [alertsDropClaimed, bumpStats, language, notify],
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

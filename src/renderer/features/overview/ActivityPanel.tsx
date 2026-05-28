import * as React from "react";
import { FeedItem } from "@renderer/shared/components/ui/feed-item";
import {
  Check,
  RotateCw,
  Plus,
  AlertTriangle,
  Play,
} from "@renderer/shared/lib/icons";
import { formatRelative } from "./formatters";
import { useI18n } from "@renderer/shared/i18n";
import { useActivityFeed, type ActivityEvent } from "@renderer/shared/utils/activityFeed";

export type ActivityPanelProps = {
  maxItems?: number;
};

type EventVisual = {
  icon: React.ReactNode;
  tone: "ok" | "accent" | "warn" | "info";
};

/** Icon + tone per event kind. Keeps the render switch concise. */
function visualFor(kind: ActivityEvent["kind"]): EventVisual {
  switch (kind) {
    case "drop-claimed":
      return { icon: <Check />, tone: "ok" };
    case "auto-switch":
      return { icon: <RotateCw />, tone: "accent" };
    case "new-drops":
      return { icon: <Plus />, tone: "info" };
    case "watch-error":
      return { icon: <AlertTriangle />, tone: "warn" };
    case "watch-started":
      return { icon: <Play />, tone: "accent" };
  }
}

/**
 * Renders the headline message for an event. Pulls translated copy and the
 * variable subsitutions through i18n. Returns a ReactNode so we can mix
 * <strong> emphasis into the message (e.g. the drop title).
 */
function renderMessage(
  event: ActivityEvent,
  t: ReturnType<typeof useI18n>["t"],
): React.ReactNode {
  switch (event.kind) {
    case "drop-claimed":
      return (
        <>
          {t("activity.event.dropClaimed")} <strong>{event.title}</strong>
        </>
      );
    case "auto-switch":
      return t("activity.event.autoSwitch", {
        from: event.fromName || "—",
        to: event.toName || "—",
      });
    case "new-drops": {
      const key =
        event.count === 1 ? "activity.event.newDrops.one" : "activity.event.newDrops.other";
      return t(key, { count: event.count });
    }
    case "watch-error":
      return event.message
        ? t("activity.event.watchErrorWithMessage", { message: event.message })
        : t("activity.event.watchError");
    case "watch-started":
      return (
        <>
          {t("activity.event.watchStarted")} <strong>{event.channelName}</strong>
        </>
      );
  }
}

/** Renders the meta line under the headline (subtitle + relative time). */
function renderMeta(
  event: ActivityEvent,
  t: ReturnType<typeof useI18n>["t"],
): React.ReactNode {
  const time = formatRelative(event.at);
  switch (event.kind) {
    case "drop-claimed":
      return (
        <>
          <span style={{ color: "var(--dp-accent)" }}>{event.game}</span>
          {" · "}
          {time}
        </>
      );
    case "auto-switch":
      return (
        <>
          {t(`activity.event.autoSwitch.reason.${event.reason}`)}
          {" · "}
          {time}
        </>
      );
    case "new-drops":
      return event.sampleTitle ? (
        <>
          {event.sampleTitle}
          {" · "}
          {time}
        </>
      ) : (
        time
      );
    case "watch-error":
      return event.code ? (
        <>
          <span className="font-mono text-[10px]">{event.code}</span>
          {" · "}
          {time}
        </>
      ) : (
        time
      );
    case "watch-started":
      return event.game ? (
        <>
          <span style={{ color: "var(--dp-accent)" }}>{event.game}</span>
          {" · "}
          {time}
        </>
      ) : (
        time
      );
  }
}

export function ActivityPanel({ maxItems = 8 }: ActivityPanelProps) {
  const { t } = useI18n();
  const events = useActivityFeed();
  const slice = React.useMemo(() => events.slice(0, maxItems), [events, maxItems]);

  return (
    <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-4 py-4">
      <span className="block font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--dp-text-dim)] mb-3">
        {t("activity.header")}
      </span>
      {slice.length === 0 ? (
        <div className="py-2 font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
          {t("activity.empty")}
        </div>
      ) : (
        slice.map((event, idx) => {
          const { icon, tone } = visualFor(event.kind);
          return (
            <FeedItem
              key={event.id}
              tone={tone}
              icon={icon}
              msg={renderMessage(event, t)}
              meta={renderMeta(event, t)}
              last={idx === slice.length - 1}
            />
          );
        })
      )}
    </div>
  );
}

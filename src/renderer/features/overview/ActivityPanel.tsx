import * as React from "react";
import { FeedItem } from "@renderer/shared/components/ui/feed-item";
import { Check } from "@renderer/shared/lib/icons";
import type { InventoryItem } from "@renderer/shared/types";
import { formatRelative } from "./formatters";
import { useI18n } from "@renderer/shared/i18n";

export type ActivityPanelProps = {
  items: InventoryItem[];
  maxItems?: number;
};

export function ActivityPanel({ items, maxItems = 5 }: ActivityPanelProps) {
  const { t } = useI18n();
  const claimed = React.useMemo(() => {
    return items.filter((it) => it.status === "claimed").slice(0, maxItems);
  }, [items, maxItems]);

  return (
    <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-4 py-4">
      <span className="block font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--dp-text-dim)] mb-3">
        {t("activity.header")}
      </span>
      {claimed.length === 0 ? (
        <div className="py-2 font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
          {t("activity.empty")}
        </div>
      ) : (
        claimed.map((item, idx) => {
          const claimedAt = (item as InventoryItem & { claimedAt?: number }).claimedAt ?? null;
          const meta = (
            <>
              <span style={{ color: "var(--dp-accent)" }}>{item.game}</span>
              {" · "}
              {claimedAt ? formatRelative(claimedAt) : t("activity.recently")}
            </>
          );
          return (
            <FeedItem
              key={item.id}
              tone="ok"
              icon={<Check />}
              msg={
                <>
                  {t("activity.claimedPrefix")} <strong>{item.title}</strong>
                </>
              }
              meta={meta}
              last={idx === claimed.length - 1}
            />
          );
        })
      )}
    </div>
  );
}

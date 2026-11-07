import { cn } from "@renderer/shared/lib/utils";
import { useI18n } from "@renderer/shared/i18n";
import type { FallbackRule } from "./gamesModel";

const OPTIONS: Array<{ rule: FallbackRule; title: string; desc: string }> = [
  { rule: "wait", title: "games.fallback.wait.title", desc: "games.fallback.wait.desc" },
  {
    rule: "farm-others",
    title: "games.fallback.farmOthers.title",
    desc: "games.fallback.farmOthers.desc",
  },
];

/** What happens when none of the user's games can be farmed (obeyPriority). */
export function FallbackRuleFieldset({
  rule,
  onChange,
}: {
  rule: FallbackRule;
  onChange: (rule: FallbackRule) => void;
}) {
  const { t } = useI18n();
  return (
    <fieldset className="m-0 flex flex-col gap-2.5 rounded-[var(--dp-radius-xl)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] p-[18px]">
      <legend className="float-left mb-1.5 w-full p-0 font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
        {t("games.fallback.legend")}
      </legend>
      {OPTIONS.map((option) => {
        const checked = option.rule === rule;
        return (
          <label
            key={option.rule}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-[var(--dp-radius-md)] border px-4 py-3.5 transition-colors hover:bg-[color:var(--dp-bg-elevated-2)]",
              checked
                ? "border-[color-mix(in_srgb,var(--dp-accent)_50%,transparent)] bg-[color:var(--dp-accent-soft)]"
                : "border-[color:var(--dp-border)]",
            )}
          >
            <input
              type="radio"
              name="dp-fallback-rule"
              value={option.rule}
              checked={checked}
              onChange={() => onChange(option.rule)}
              className="mt-[3px] accent-[var(--dp-accent)]"
            />
            <span>
              <span className="block font-medium text-[color:var(--dp-text)]">
                {t(option.title)}
              </span>
              <span className="block text-[13px] text-[color:var(--dp-text-dim)]">
                {t(option.desc)}
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

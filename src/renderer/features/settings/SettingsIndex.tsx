import { useI18n } from "@renderer/shared/i18n";
import { cn } from "@renderer/shared/lib/utils";
import type { SettingsSection, SettingsSectionKey } from "./settingsSections";

export type SettingsIndexProps = {
  sections: SettingsSection[];
  active: SettingsSectionKey | null;
  onPick: (section: SettingsSection) => void;
};

/** Left index of anchor links; the current section is highlighted. */
export function SettingsIndex({ sections, active, onPick }: SettingsIndexProps) {
  const { t } = useI18n();
  return (
    <nav
      aria-label={t("settings.index.aria")}
      className="flex flex-col gap-0.5 md:sticky md:top-0 md:self-start"
    >
      <h1 className="m-0 mb-3.5 ml-3 text-[22px] font-semibold text-[color:var(--dp-text)]">
        {t("settings.pageTitle")}
      </h1>
      <div className="flex flex-wrap gap-0.5 md:flex-col">
        {sections.map((section) => {
          const current = section.key === active;
          return (
            <a
              key={section.key}
              href={`#${section.id}`}
              aria-current={current ? "true" : undefined}
              onClick={(e) => {
                e.preventDefault();
                onPick(section);
              }}
              className={cn(
                "flex min-h-[34px] items-center rounded-[var(--dp-radius-md)] px-3 font-mono text-[12px] transition-colors",
                current
                  ? "bg-[color:var(--dp-accent-soft)] text-[color:var(--dp-accent)]"
                  : "text-[color:var(--dp-text-dimmer)] hover:bg-[color:var(--dp-bg-elevated)] hover:text-[color:var(--dp-text)]",
              )}
            >
              {t(`settings.section.${section.key}`)}
            </a>
          );
        })}
      </div>
    </nav>
  );
}

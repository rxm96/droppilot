import * as React from "react";
import { useI18n } from "@renderer/shared/i18n";
import { cn } from "@renderer/shared/lib/utils";
import { Button } from "@renderer/shared/components/ui/button";
import { Check } from "@renderer/shared/lib/icons";
import { ColorPopover } from "./ColorPopover";

/**
 * 8 preset accent colors. Each is a midtone violet/blue/green/amber/orange/rose/slate
 * picked to read well on both dark (#0a0b0d) and light (#fafaf9) backgrounds.
 * The first entry (violet) matches the dark-mode default `--dp-accent`.
 */
const PRESETS: Array<{ id: string; color: string; nameKey: string }> = [
  { id: "violet", color: "#a78bfa", nameKey: "settings.row.accent.preset.violet" },
  { id: "indigo", color: "#818cf8", nameKey: "settings.row.accent.preset.indigo" },
  { id: "sky", color: "#38bdf8", nameKey: "settings.row.accent.preset.sky" },
  { id: "emerald", color: "#34d399", nameKey: "settings.row.accent.preset.emerald" },
  { id: "amber", color: "#fbbf24", nameKey: "settings.row.accent.preset.amber" },
  { id: "orange", color: "#fb923c", nameKey: "settings.row.accent.preset.orange" },
  { id: "rose", color: "#fb7185", nameKey: "settings.row.accent.preset.rose" },
  { id: "slate", color: "#94a3b8", nameKey: "settings.row.accent.preset.slate" },
];

export type AccentPickerProps = {
  /** Current accent hex; null means "no override" (CSS default). */
  accent: string | null;
  setAccent: (value: string | null) => void;
};

export function AccentPicker({ accent, setAccent }: AccentPickerProps) {
  const { t } = useI18n();

  // Compare case-insensitively so user-typed "#A78BFA" still matches the violet preset.
  const normalized = accent?.toLowerCase() ?? null;
  const activePresetId = PRESETS.find((p) => p.color.toLowerCase() === normalized)?.id ?? null;
  const isCustom = accent !== null && !activePresetId;

  // Track the live custom value separately so the color input shows the current accent
  // (or the default violet if no override) without overwriting the user-typed value.
  const customColorValue = accent && /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : "#a78bfa";

  return (
    // Single-row layout: 8 preset swatches + custom-color swatch + optional reset
    // button. With SettingRow's `stacked` variant the picker spans the full
    // panel width so it doesn't wrap unless the window is very narrow.
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((preset) => {
        const isActive = preset.id === activePresetId;
        const name = t(preset.nameKey);
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => setAccent(preset.color)}
            aria-label={t("settings.row.accent.swatchAria", { name })}
            aria-pressed={isActive}
            title={name}
            className={cn(
              "relative inline-flex h-7 w-7 items-center justify-center rounded-full",
              "transition-transform hover:scale-110",
              isActive
                ? "ring-2 ring-offset-2 ring-offset-[color:var(--dp-bg-elevated)]"
                : "ring-1 ring-[color:var(--dp-border)]",
            )}
            style={{
              background: preset.color,
              // The active ring uses the swatch color so the indicator matches what got picked.
              ...(isActive ? ({ "--tw-ring-color": preset.color } as React.CSSProperties) : {}),
            }}
          >
            {isActive && (
              <Check
                size={12}
                strokeWidth={2.4}
                className="text-[color:var(--dp-bg-app)]"
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}

      {/* Custom color — opens our in-app picker popover (SV + hue + hex). */}
      <ColorPopover color={customColorValue} active={isCustom} onPick={setAccent} />

      {/* Inline reset button (only shown when an override is active) */}
      {accent !== null && (
        <>
          {/* Tiny vertical divider so the reset button reads as a separate action */}
          <span
            aria-hidden="true"
            className="mx-1 inline-block h-5 w-px bg-[color:var(--dp-border)]"
          />
          <Button variant="dp-ghost" size="dp-sm" onClick={() => setAccent(null)}>
            {t("settings.row.accent.reset")}
          </Button>
        </>
      )}
    </div>
  );
}

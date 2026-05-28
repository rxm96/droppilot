# Design Overhaul — Phase 6: Settings View Migration + Wirings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Migrate `SettingsView` (715 lines, ~50 props, legacy 2-column layout) to the Pro Console pattern per spec §7.5 — sidebar section navigation + grouped setting-row primitives. Plus two small wirings: plumb `refreshMinMs`/`refreshMaxMs` through to the Overview EnginePanel (replacing the hardcoded `30s` placeholder), and stabilize `navProps.setView` via `useCallback` in `useAppModel` (fixes the per-render memo invalidation flagged in Phase 5 final review).

**Architecture:** Build 3 new Settings primitives: `SettingRow` (label + description + control slot), `SettingsToggle` (custom-styled boolean control), `SettingsSidebar` (section nav). Group the existing ~50 settings into 6-7 logical sections (general / engine / appearance / updates / alerts / advanced / account). Rewrite `SettingsView.tsx` as a sidebar + section composition. All existing `useAppModel.settingsProps` props consumed unchanged.

**Tech Stack:** React 19, Tailwind 4, Phase 1 primitives (Button, Input, Select, SectionLabel, Card, Pill), Phase 1 chrome (already in App.tsx), Phase 2 formatters, Lucide icons.

**Spec reference:** [`../specs/2026-05-27-design-overhaul-design.md`](../specs/2026-05-27-design-overhaul-design.md) §7.5 Settings.

**Branch:** `feat/design-overhaul-phase-6-settings` (stacked on `feat/design-overhaul-phase-5-polish`)

**PR target:** `feat/design-overhaul-phase-5-polish` — GitHub auto-retargets up the chain.

### Locked design decisions

1. **Layout:** 200px sidebar on the left + main scrollable pane. Sidebar item = section name + count of settings in it (optional). Active section highlighted with accent-soft bg + accent text.
2. **Section list:** `general`, `engine`, `appearance`, `updates` (only if `showUpdateCheck`), `alerts`, `advanced`, `account` (only if `isLinked` is meaningful — keep it always-visible).
3. **SettingRow layout:** 2-column grid (1fr 240px) on wide viewports — label/desc on left, control on right. Vertical stack on narrow viewports (responsive `@media (max-width: 720px)`).
4. **Toggle:** custom-styled switch (not native checkbox) to match the Pro Console aesthetic. Lives as new `SettingsToggle` primitive.
5. **Section sub-grouping:** Within a section, related rows are grouped under a `SectionLabel` (e.g. "claim alerts", "stream alerts" within Alerts section).
6. **Number input** (e.g. `alertsDropEndingMinutes`, `refreshMinMs`/`refreshMaxMs`): use existing `Input` with `type="number"` and `tone="dp"`.
7. **Settings JSON export/import** — a separate full-width row block at the bottom of the Advanced section. Textarea + Export/Import buttons.
8. **Wirings included** (not deferred):
   - EnginePanel `watch_cycle` / `cadence` real values from `refreshMinMs`/`refreshMaxMs` (via new prop on `overviewProps`)
   - `navProps.setView` stabilized via `useCallback` in `useAppModel`

### Deviations from spec

1. **Spec §7.5 mentions "section-headers: mono uppercase with trailing rule"** — sub-section labels within a section use SectionLabel (with trailing rule). Section headings themselves (the H2 for the active section) use plain non-rule treatment to feel like a single content surface.
2. **Spec doesn't enumerate ALL existing settings** — Phase 6 preserves every existing setting from `settingsProps` (50+ items). The visual layout matches the spec but the breadth is what the model exposes.
3. **Spec mentions "right-aligned mini-stats: drops earned / pending"** for Priorities — that's Phase 4 scope, not Phase 6. Not applicable here.

---

## File Structure

**New files:**
- `src/renderer/features/settings/SettingRow.tsx` — generic label/desc/control row
- `src/renderer/features/settings/SettingsToggle.tsx` — custom switch control
- `src/renderer/features/settings/SettingsSidebar.tsx` — section navigation
- `src/renderer/features/settings/sections/GeneralSection.tsx` — general settings (language, demo)
- `src/renderer/features/settings/sections/EngineSection.tsx` — engine + automation (auto-claim, auto-switch, refresh intervals, etc.)
- `src/renderer/features/settings/sections/AppearanceSection.tsx` — theme, badges/emotes
- `src/renderer/features/settings/sections/UpdatesSection.tsx` — update channel + manual check + status
- `src/renderer/features/settings/sections/AlertsSection.tsx` — all alert toggles + ending-soon minutes
- `src/renderer/features/settings/sections/AdvancedSection.tsx` — debug, reset automation, JSON export/import
- `src/renderer/features/settings/sections/AccountSection.tsx` — link status, allowUnlinkedGames
- `src/renderer/features/settings/useSettingsViewState.ts` — local UI state (active section)

**Modified files:**
- `src/renderer/features/settings/SettingsView.tsx` — full rewrite as sidebar + section composition (~120 lines)
- `src/renderer/features/overview/EnginePanel.tsx` — accept `cycleSeconds` + `cadenceSeconds` props from parent instead of hardcoded 30
- `src/renderer/features/overview/OverviewView.tsx` — accept + forward the two new props
- `src/renderer/App.tsx` — pass `refreshMinMs`/`refreshMaxMs` into OverviewView via overviewPropsExtended
- `src/renderer/shared/hooks/app/useAppModel.ts` — wrap `setView` in `useCallback` so navProps' setView reference is stable (the actual hook may already do this — verify); also expose `refreshMinMs`/`refreshMaxMs` on overviewProps

**Untouched (intentionally):**
- All Phase 1/2/3/4/5 primitives — used as-is
- Other features (overview/inventory/control/priority/debug) — unchanged
- `src/renderer/shared/i18n.tsx` — all existing `settings.*` keys reused
- Settings business logic in `useAppModel` — unchanged

---

## Section Mapping (data → section)

| Section | Settings (from `settingsProps`) |
| --- | --- |
| **General** | `language`, `demoMode`, `sendTestAlert` (as action button under "Diagnostics") |
| **Engine** | `autoStart`, `autoClaim`, `autoSelect`, `autoSwitchEnabled`, `warmupEnabled`, `refreshMinMs`/`refreshMaxMs`, `resetAutomation` (action button) |
| **Appearance** | `theme`, `enableBadgesEmotes` |
| **Updates** | `updateChannel`, `updateStatus`, `checkUpdates`/`downloadUpdate`/`installUpdate` (conditional buttons) |
| **Alerts** | `alertsEnabled`, `alertsNotifyWhileFocused`, `alertsDropClaimed`, `alertsDropEndingSoon`, `alertsDropEndingMinutes`, `alertsWatchError`, `alertsAutoSwitch`, `alertsNewDrops` |
| **Account** | `isLinked` (display only), `allowUnlinkedGames` |
| **Advanced** | `debugEnabled`, `settingsJson`/`exportSettings`/`importSettings` (JSON block) |

---

## Task 1: Create `SettingRow.tsx`

Generic row layout: label + description on left, control slot on right.

**Files:** Create `src/renderer/features/settings/SettingRow.tsx`

- [ ] **Step 1: Create the file**

```tsx
import * as React from "react";
import { cn } from "@renderer/shared/lib/utils";

export type SettingRowProps = {
  label: React.ReactNode;
  description?: React.ReactNode;
  /** The control element (toggle, input, select, button row). */
  control: React.ReactNode;
  /** When true, the row is dimmed (e.g. disabled by a parent toggle). */
  disabled?: boolean;
  /** Adds a top border to visually separate from the previous row. */
  divided?: boolean;
  className?: string;
};

export function SettingRow({
  label,
  description,
  control,
  disabled,
  divided,
  className,
}: SettingRowProps) {
  return (
    <div
      className={cn(
        "grid items-start gap-6 py-4",
        divided && "border-t border-[color:var(--dp-border-soft)]",
        disabled && "opacity-50 pointer-events-none",
        className,
      )}
      style={{ gridTemplateColumns: "1fr 240px" }}
    >
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-[color:var(--dp-text)] leading-tight">
          {label}
        </div>
        {description != null && (
          <div className="mt-1 font-mono text-[10px] leading-relaxed text-[color:var(--dp-text-dimmer)]">
            {description}
          </div>
        )}
      </div>
      <div className="flex flex-col items-stretch gap-2">{control}</div>
    </div>
  );
}
```

- [ ] **Step 2: tsc clean + commit**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "SettingRow" | head -5
# expected: empty

git add src/renderer/features/settings/SettingRow.tsx
git commit -m "feat(settings): add SettingRow primitive

Generic 2-column row: label (sans) + description (mono dim) on the
left, control slot on the right. Supports a divided variant
(top border) for visual grouping and a disabled state."
```

---

## Task 2: Create `SettingsToggle.tsx`

Custom-styled switch matching the Pro Console aesthetic.

**Files:** Create `src/renderer/features/settings/SettingsToggle.tsx`

- [ ] **Step 1: Create the file**

```tsx
import * as React from "react";
import { cn } from "@renderer/shared/lib/utils";

export type SettingsToggleProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
};

export function SettingsToggle({
  checked,
  onChange,
  label,
  disabled,
  className,
}: SettingsToggleProps) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 cursor-pointer select-none",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          "relative inline-flex h-[20px] w-[36px] flex-shrink-0 items-center rounded-full transition-colors",
          "border",
          checked
            ? "bg-[color:var(--dp-accent)] border-[color:var(--dp-accent)]"
            : "bg-[color:var(--dp-bg-elevated-2)] border-[color:var(--dp-border)]",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-block h-[14px] w-[14px] rounded-full bg-white transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-[2px]",
          )}
        />
      </button>
      {label && (
        <span className="font-mono text-[11px] text-[color:var(--dp-text-dim)]">{label}</span>
      )}
    </label>
  );
}
```

- [ ] **Step 2: tsc clean + commit**

```
feat(settings): add SettingsToggle custom switch

Custom-styled switch (button role=switch + aria-checked) matching
the Pro Console aesthetic. 36x20 track with 14x14 thumb that
translates between left (off) and right (on). On = accent fill;
off = elevated-2 with border. Optional inline label.
```

---

## Task 3: Create `SettingsSidebar.tsx`

Section navigation with active highlight.

**Files:** Create `src/renderer/features/settings/SettingsSidebar.tsx`

- [ ] **Step 1: Create the file**

```tsx
import * as React from "react";
import {
  Settings as SettingsIcon,
  Play,
  Sun,
  Download,
  AlertTriangle,
  User,
  Bug,
} from "@renderer/shared/lib/icons";
import { cn } from "@renderer/shared/lib/utils";

export type SettingsSectionKey =
  | "general"
  | "engine"
  | "appearance"
  | "updates"
  | "alerts"
  | "account"
  | "advanced";

export type SettingsSidebarItem = {
  key: SettingsSectionKey;
  label: string;
};

export type SettingsSidebarProps = {
  items: SettingsSidebarItem[];
  active: SettingsSectionKey;
  onChange: (next: SettingsSectionKey) => void;
};

const ICON_MAP: Record<SettingsSectionKey, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  general: SettingsIcon,
  engine: Play,
  appearance: Sun,
  updates: Download,
  alerts: AlertTriangle,
  account: User,
  advanced: Bug,
};

export function SettingsSidebar({ items, active, onChange }: SettingsSidebarProps) {
  return (
    <nav
      aria-label="Settings sections"
      className="flex flex-col gap-0.5 w-[200px] flex-shrink-0"
      role="tablist"
    >
      {items.map((item) => {
        const Icon = ICON_MAP[item.key];
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item.key)}
            className={cn(
              "inline-flex items-center gap-2.5 px-3 py-2 rounded-[var(--dp-radius-sm)] text-left",
              "font-mono text-[12px] tracking-[0.02em] transition-colors",
              isActive
                ? "bg-[color:var(--dp-accent-soft)] text-[color:var(--dp-accent)]"
                : "text-[color:var(--dp-text-dim)] hover:bg-[color:var(--dp-bg-elevated)] hover:text-[color:var(--dp-text)]",
            )}
          >
            <Icon size={13} strokeWidth={1.7} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: tsc clean + commit**

```
feat(settings): add SettingsSidebar section nav

200px-wide column of pill-rounded buttons, one per section.
Active item gets accent-soft bg + accent text; inactive gets
text-dim with hover bg-elevated. Each has a Lucide icon
+ label. ARIA tablist/tab semantics.
```

---

## Task 4: Create `useSettingsViewState.ts`

Local UI state for the active section.

**Files:** Create `src/renderer/features/settings/useSettingsViewState.ts`

- [ ] **Step 1: Create the file**

```ts
import * as React from "react";
import type { SettingsSectionKey } from "./SettingsSidebar";

export function useSettingsViewState(initial: SettingsSectionKey = "general") {
  const [active, setActive] = React.useState<SettingsSectionKey>(initial);
  return { active, setActive };
}
```

- [ ] **Step 2: tsc clean + commit**

```
feat(settings): add useSettingsViewState hook

Local UI state hook owning the active sidebar section. Stateless
otherwise — settings persistence lives in useAppModel as before.
```

---

## Task 5: Create section components (one task per section)

Each section reads its slice of `settingsProps` and renders SettingRow + SettingsToggle composables.

### Task 5a: `GeneralSection.tsx`

**File:** `src/renderer/features/settings/sections/GeneralSection.tsx`

```tsx
import * as React from "react";
import { useI18n } from "@renderer/shared/i18n";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@renderer/shared/components/ui/select";
import { Button } from "@renderer/shared/components/ui/button";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { SettingRow } from "../SettingRow";
import { SettingsToggle } from "../SettingsToggle";

export type GeneralSectionProps = {
  language: "de" | "en";
  setLanguage: (val: "de" | "en") => void;
  demoMode: boolean;
  setDemoMode: (val: boolean) => void;
  sendTestAlert: () => void;
};

export function GeneralSection(props: GeneralSectionProps) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col">
      <SectionLabel>language &amp; mode</SectionLabel>
      <SettingRow
        label="Language"
        description="Interface language for labels, alerts, and onboarding text."
        control={
          <Select value={props.language} onValueChange={(v) => props.setLanguage(v as "de" | "en")}>
            <SelectTrigger tone="dp" aria-label="Language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="de">Deutsch</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        }
      />
      <SettingRow
        divided
        label="Demo mode"
        description="Use synthetic data so you can preview the UI without a Twitch login."
        control={<SettingsToggle checked={props.demoMode} onChange={props.setDemoMode} />}
      />

      <div className="mt-6">
        <SectionLabel>diagnostics</SectionLabel>
        <SettingRow
          label="Send test alert"
          description="Triggers a desktop notification to verify alerts work on this OS."
          control={
            <Button variant="dp-secondary" size="dp-md" onClick={props.sendTestAlert}>
              send test
            </Button>
          }
        />
      </div>
    </div>
  );
}
```

Verify tsc + commit:
```
feat(settings): add GeneralSection (language + demo + diagnostics)
```

### Task 5b: `EngineSection.tsx`

**File:** `src/renderer/features/settings/sections/EngineSection.tsx`

```tsx
import * as React from "react";
import { Button } from "@renderer/shared/components/ui/button";
import { Input } from "@renderer/shared/components/ui/input";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { SettingRow } from "../SettingRow";
import { SettingsToggle } from "../SettingsToggle";

export type EngineSectionProps = {
  autoStart?: boolean;
  setAutoStart?: (val: boolean) => void;
  showAutoStart?: boolean;
  autoClaim: boolean;
  setAutoClaim: (val: boolean) => void;
  autoSelect: boolean;
  setAutoSelect: (val: boolean) => void;
  autoSwitchEnabled: boolean;
  setAutoSwitchEnabled: (val: boolean) => void;
  warmupEnabled: boolean;
  setWarmupEnabled: (val: boolean) => void;
  refreshMinMs: number;
  refreshMaxMs: number;
  setRefreshIntervals: (minMs: number, maxMs: number) => void;
  resetAutomation: () => void;
};

export function EngineSection(props: EngineSectionProps) {
  return (
    <div className="flex flex-col">
      {props.showAutoStart && (
        <>
          <SectionLabel>app lifecycle</SectionLabel>
          <SettingRow
            label="Launch at login"
            description="Starts Droppilot automatically when you log into your OS."
            control={
              <SettingsToggle
                checked={!!props.autoStart}
                onChange={(v) => props.setAutoStart?.(v)}
              />
            }
          />
        </>
      )}

      <div className={props.showAutoStart ? "mt-6" : undefined}>
        <SectionLabel>automation</SectionLabel>
        <SettingRow
          label="Auto-claim"
          description="Automatically claim earned drops when they're available."
          control={<SettingsToggle checked={props.autoClaim} onChange={props.setAutoClaim} />}
        />
        <SettingRow
          divided
          label="Auto-select target game"
          description="Pick the next watchable game based on your priorities."
          control={<SettingsToggle checked={props.autoSelect} onChange={props.setAutoSelect} />}
        />
        <SettingRow
          divided
          label="Auto-switch on stall"
          description="If no progress is detected, switch to a different live channel."
          control={
            <SettingsToggle
              checked={props.autoSwitchEnabled}
              onChange={props.setAutoSwitchEnabled}
            />
          }
        />
        <SettingRow
          divided
          label="Warm up watcher"
          description="Send a probe before binding to detect cookie/auth issues early."
          control={
            <SettingsToggle checked={props.warmupEnabled} onChange={props.setWarmupEnabled} />
          }
        />
      </div>

      <div className="mt-6">
        <SectionLabel>refresh cadence</SectionLabel>
        <SettingRow
          label="Channels refresh interval"
          description="How often the channel tracker re-queries Twitch (random jitter between min and max)."
          control={
            <div className="flex items-center gap-2">
              <Input
                tone="dp"
                type="number"
                min={5}
                value={Math.round(props.refreshMinMs / 1000)}
                onChange={(e) => {
                  const min = Math.max(5, Number(e.target.value) || 0) * 1000;
                  props.setRefreshIntervals(min, Math.max(min, props.refreshMaxMs));
                }}
                aria-label="Minimum interval seconds"
                className="w-20"
              />
              <span className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">to</span>
              <Input
                tone="dp"
                type="number"
                min={5}
                value={Math.round(props.refreshMaxMs / 1000)}
                onChange={(e) => {
                  const max = Math.max(5, Number(e.target.value) || 0) * 1000;
                  props.setRefreshIntervals(Math.min(max, props.refreshMinMs), max);
                }}
                aria-label="Maximum interval seconds"
                className="w-20"
              />
              <span className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">sec</span>
            </div>
          }
        />
      </div>

      <div className="mt-6">
        <SectionLabel>danger zone</SectionLabel>
        <SettingRow
          label="Reset automation flags"
          description="Clears auto-claim, auto-switch, warmup, etc. back to defaults. Does not log you out."
          control={
            <Button variant="dp-outline" size="dp-md" onClick={props.resetAutomation}>
              reset
            </Button>
          }
        />
      </div>
    </div>
  );
}
```

Commit:
```
feat(settings): add EngineSection (automation + refresh + reset)
```

### Task 5c: `AppearanceSection.tsx`

```tsx
import * as React from "react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@renderer/shared/components/ui/select";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { SettingRow } from "../SettingRow";
import { SettingsToggle } from "../SettingsToggle";
import type { ThemePreference } from "@renderer/shared/theme";

export type AppearanceSectionProps = {
  theme: ThemePreference;
  setTheme: (val: ThemePreference) => void;
  enableBadgesEmotes: boolean;
  setEnableBadgesEmotes: (val: boolean) => void;
};

export function AppearanceSection(props: AppearanceSectionProps) {
  return (
    <div className="flex flex-col">
      <SectionLabel>theme</SectionLabel>
      <SettingRow
        label="Color scheme"
        description="Light, dark, or follow your OS preference."
        control={
          <Select value={props.theme} onValueChange={(v) => props.setTheme(v as ThemePreference)}>
            <SelectTrigger tone="dp" aria-label="Theme">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="light">Light</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        }
      />

      <div className="mt-6">
        <SectionLabel>content</SectionLabel>
        <SettingRow
          label="Show badges & emotes"
          description="Display Twitch badges and emotes in chat-like elements."
          control={
            <SettingsToggle
              checked={props.enableBadgesEmotes}
              onChange={props.setEnableBadgesEmotes}
            />
          }
        />
      </div>
    </div>
  );
}
```

Commit: `feat(settings): add AppearanceSection (theme + content toggles)`

### Task 5d: `UpdatesSection.tsx`

```tsx
import * as React from "react";
import { Button } from "@renderer/shared/components/ui/button";
import { Pill } from "@renderer/shared/components/ui/pill";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@renderer/shared/components/ui/select";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { SettingRow } from "../SettingRow";
import type { UpdateChannel } from "../../../../shared/updateChannels";

export type UpdatesSectionProps = {
  updateChannel: UpdateChannel;
  setUpdateChannel: (val: UpdateChannel) => void;
  updateStatus?: {
    state:
      | "idle"
      | "checking"
      | "available"
      | "downloading"
      | "downloaded"
      | "none"
      | "error"
      | "unsupported";
    message?: string;
    version?: string;
    progress?: number;
  };
  checkUpdates?: () => void;
  downloadUpdate?: () => void;
  installUpdate?: () => void;
};

export function UpdatesSection(props: UpdatesSectionProps) {
  const state = props.updateStatus?.state ?? "idle";
  const version = props.updateStatus?.version;
  const progress = props.updateStatus?.progress;
  const statusPill = (() => {
    switch (state) {
      case "available":
        return <Pill tone="accent" dot>update available{version ? ` · v${version}` : ""}</Pill>;
      case "downloading":
        return (
          <Pill tone="info" dot>
            downloading{typeof progress === "number" ? ` · ${Math.round(progress)}%` : ""}
          </Pill>
        );
      case "downloaded":
        return <Pill tone="ok" dot>downloaded{version ? ` · v${version}` : ""}</Pill>;
      case "error":
        return (
          <Pill tone="err" dot title={props.updateStatus?.message}>
            update error
          </Pill>
        );
      case "checking":
        return <Pill tone="info" dot>checking…</Pill>;
      case "none":
        return <Pill tone="dim">up to date</Pill>;
      case "unsupported":
        return <Pill tone="dim">updates unsupported</Pill>;
      default:
        return <Pill tone="dim">idle</Pill>;
    }
  })();

  return (
    <div className="flex flex-col">
      <SectionLabel>release channel</SectionLabel>
      <SettingRow
        label="Update channel"
        description="Switch between stable and pre-release releases."
        control={
          <Select value={props.updateChannel} onValueChange={(v) => props.setUpdateChannel(v as UpdateChannel)}>
            <SelectTrigger tone="dp" aria-label="Update channel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="stable">Stable</SelectItem>
                <SelectItem value="beta">Beta</SelectItem>
                <SelectItem value="rc">Release candidate</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        }
      />

      <div className="mt-6">
        <SectionLabel>current state</SectionLabel>
        <SettingRow
          label="Status"
          description="Last known update status reported by the auto-updater."
          control={<div>{statusPill}</div>}
        />
        <SettingRow
          divided
          label="Actions"
          description="Manually trigger a check, download, or install."
          control={
            <div className="flex flex-wrap gap-2">
              {props.checkUpdates && (
                <Button
                  variant="dp-secondary"
                  size="dp-sm"
                  onClick={props.checkUpdates}
                  disabled={state === "checking" || state === "downloading"}
                >
                  check
                </Button>
              )}
              {props.downloadUpdate && state === "available" && (
                <Button variant="dp-primary" size="dp-sm" onClick={props.downloadUpdate}>
                  download
                </Button>
              )}
              {props.installUpdate && state === "downloaded" && (
                <Button variant="dp-primary" size="dp-sm" onClick={props.installUpdate}>
                  install &amp; restart
                </Button>
              )}
            </div>
          }
        />
      </div>
    </div>
  );
}
```

Commit: `feat(settings): add UpdatesSection (channel + status + actions)`

### Task 5e: `AlertsSection.tsx`

```tsx
import * as React from "react";
import { Input } from "@renderer/shared/components/ui/input";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { SettingRow } from "../SettingRow";
import { SettingsToggle } from "../SettingsToggle";

export type AlertsSectionProps = {
  alertsEnabled: boolean;
  setAlertsEnabled: (val: boolean) => void;
  alertsNotifyWhileFocused: boolean;
  setAlertsNotifyWhileFocused: (val: boolean) => void;
  alertsDropClaimed: boolean;
  setAlertsDropClaimed: (val: boolean) => void;
  alertsDropEndingSoon: boolean;
  setAlertsDropEndingSoon: (val: boolean) => void;
  alertsDropEndingMinutes: number;
  setAlertsDropEndingMinutes: (val: number) => void;
  alertsWatchError: boolean;
  setAlertsWatchError: (val: boolean) => void;
  alertsAutoSwitch: boolean;
  setAlertsAutoSwitch: (val: boolean) => void;
  alertsNewDrops: boolean;
  setAlertsNewDrops: (val: boolean) => void;
};

export function AlertsSection(props: AlertsSectionProps) {
  const disabledByMaster = !props.alertsEnabled;
  return (
    <div className="flex flex-col">
      <SectionLabel>master switch</SectionLabel>
      <SettingRow
        label="Desktop alerts"
        description="Master toggle. When off, no notifications are sent regardless of the per-event settings below."
        control={
          <SettingsToggle checked={props.alertsEnabled} onChange={props.setAlertsEnabled} />
        }
      />
      <SettingRow
        divided
        disabled={disabledByMaster}
        label="Notify while the app is focused"
        description="Show notifications even when Droppilot is the active window."
        control={
          <SettingsToggle
            checked={props.alertsNotifyWhileFocused}
            onChange={props.setAlertsNotifyWhileFocused}
            disabled={disabledByMaster}
          />
        }
      />

      <div className="mt-6">
        <SectionLabel>drops</SectionLabel>
        <SettingRow
          disabled={disabledByMaster}
          label="Drop claimed"
          description="A drop you were watching for has been claimed."
          control={
            <SettingsToggle
              checked={props.alertsDropClaimed}
              onChange={props.setAlertsDropClaimed}
              disabled={disabledByMaster}
            />
          }
        />
        <SettingRow
          divided
          disabled={disabledByMaster}
          label="Drop ending soon"
          description="A drop is close to expiring. Warn you N minutes before."
          control={
            <SettingsToggle
              checked={props.alertsDropEndingSoon}
              onChange={props.setAlertsDropEndingSoon}
              disabled={disabledByMaster}
            />
          }
        />
        <SettingRow
          divided
          disabled={disabledByMaster || !props.alertsDropEndingSoon}
          label="Ending-soon threshold"
          description="How many minutes before expiry the warning fires."
          control={
            <div className="flex items-center gap-2">
              <Input
                tone="dp"
                type="number"
                min={1}
                value={props.alertsDropEndingMinutes}
                onChange={(e) =>
                  props.setAlertsDropEndingMinutes(Math.max(1, Number(e.target.value) || 1))
                }
                disabled={disabledByMaster || !props.alertsDropEndingSoon}
                aria-label="Ending-soon minutes"
                className="w-24"
              />
              <span className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">min</span>
            </div>
          }
        />
        <SettingRow
          divided
          disabled={disabledByMaster}
          label="New drops available"
          description="A new campaign or drop just dropped (pun intended)."
          control={
            <SettingsToggle
              checked={props.alertsNewDrops}
              onChange={props.setAlertsNewDrops}
              disabled={disabledByMaster}
            />
          }
        />
      </div>

      <div className="mt-6">
        <SectionLabel>engine</SectionLabel>
        <SettingRow
          disabled={disabledByMaster}
          label="Watch errors"
          description="Watcher failed (auth expired, network issue, etc.)."
          control={
            <SettingsToggle
              checked={props.alertsWatchError}
              onChange={props.setAlertsWatchError}
              disabled={disabledByMaster}
            />
          }
        />
        <SettingRow
          divided
          disabled={disabledByMaster}
          label="Auto-switch happened"
          description="The watch engine moved to a different channel automatically."
          control={
            <SettingsToggle
              checked={props.alertsAutoSwitch}
              onChange={props.setAlertsAutoSwitch}
              disabled={disabledByMaster}
            />
          }
        />
      </div>
    </div>
  );
}
```

Commit: `feat(settings): add AlertsSection (master + per-event toggles)`

### Task 5f: `AccountSection.tsx`

```tsx
import * as React from "react";
import { Pill } from "@renderer/shared/components/ui/pill";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { SettingRow } from "../SettingRow";
import { SettingsToggle } from "../SettingsToggle";

export type AccountSectionProps = {
  isLinked: boolean;
  allowUnlinkedGames: boolean;
  setAllowUnlinkedGames: (val: boolean) => void;
};

export function AccountSection(props: AccountSectionProps) {
  return (
    <div className="flex flex-col">
      <SectionLabel>twitch account</SectionLabel>
      <SettingRow
        label="Connection status"
        description="Logout and re-login from the top-right of the title bar."
        control={
          <div>
            {props.isLinked ? (
              <Pill tone="ok" dot>linked</Pill>
            ) : (
              <Pill tone="warn" dot>not linked</Pill>
            )}
          </div>
        }
      />

      <div className="mt-6">
        <SectionLabel>game linking</SectionLabel>
        <SettingRow
          label="Allow unlinked games"
          description="Show drops for games where you haven't linked the Twitch account to the game account yet. They won't progress without linking."
          control={
            <SettingsToggle
              checked={props.allowUnlinkedGames}
              onChange={props.setAllowUnlinkedGames}
            />
          }
        />
      </div>
    </div>
  );
}
```

Commit: `feat(settings): add AccountSection (link status + allowUnlinked)`

### Task 5g: `AdvancedSection.tsx`

```tsx
import * as React from "react";
import { Button } from "@renderer/shared/components/ui/button";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { SettingRow } from "../SettingRow";
import { SettingsToggle } from "../SettingsToggle";

export type AdvancedSectionProps = {
  debugEnabled: boolean;
  setDebugEnabled: (val: boolean) => void;
  settingsJson: string;
  setSettingsJson: (val: string) => void;
  exportSettings: () => void;
  importSettings: () => void;
  settingsInfo?: string | null;
  settingsError?: string | null;
};

export function AdvancedSection(props: AdvancedSectionProps) {
  return (
    <div className="flex flex-col">
      <SectionLabel>diagnostics</SectionLabel>
      <SettingRow
        label="Show Debug view"
        description="Adds a 'debug' tab to the top nav with logs, perf snapshots, and a state dump."
        control={
          <SettingsToggle checked={props.debugEnabled} onChange={props.setDebugEnabled} />
        }
      />

      <div className="mt-6">
        <SectionLabel>settings export &amp; import</SectionLabel>
        <div className="py-4">
          <div className="text-[13px] font-medium text-[color:var(--dp-text)] mb-1">
            Settings JSON
          </div>
          <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] mb-3">
            Paste a JSON blob and click Import, or click Export to copy your current settings.
          </div>
          <textarea
            value={props.settingsJson}
            onChange={(e) => props.setSettingsJson(e.target.value)}
            spellCheck={false}
            className="w-full h-[160px] rounded-[var(--dp-radius-sm)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-3 py-2 font-mono text-[11px] text-[color:var(--dp-text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--dp-accent)] focus-visible:border-[color:var(--dp-accent)] resize-y"
          />
          <div className="flex gap-2 mt-3">
            <Button variant="dp-secondary" size="dp-md" onClick={props.exportSettings}>
              export
            </Button>
            <Button variant="dp-outline" size="dp-md" onClick={props.importSettings}>
              import
            </Button>
          </div>
          {props.settingsInfo && (
            <div className="mt-3 font-mono text-[10px] text-[color:var(--dp-signal-ok)]">
              {props.settingsInfo}
            </div>
          )}
          {props.settingsError && (
            <div className="mt-3 font-mono text-[10px] text-[color:var(--dp-signal-err)]">
              {props.settingsError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

Commit: `feat(settings): add AdvancedSection (debug + JSON export/import)`

---

## Task 6: Rewrite `SettingsView.tsx`

Compose all sections behind a sidebar.

**Files:** Modify `src/renderer/features/settings/SettingsView.tsx` (full rewrite)

- [ ] **Step 1: Replace file contents**

```tsx
import * as React from "react";
import type { ThemePreference } from "@renderer/shared/theme";
import type { UpdateChannel } from "../../../shared/updateChannels";
import { SettingsSidebar, type SettingsSectionKey } from "./SettingsSidebar";
import { useSettingsViewState } from "./useSettingsViewState";
import { GeneralSection } from "./sections/GeneralSection";
import { EngineSection } from "./sections/EngineSection";
import { AppearanceSection } from "./sections/AppearanceSection";
import { UpdatesSection } from "./sections/UpdatesSection";
import { AlertsSection } from "./sections/AlertsSection";
import { AccountSection } from "./sections/AccountSection";
import { AdvancedSection } from "./sections/AdvancedSection";

type SettingsProps = {
  isLinked: boolean;
  language: "de" | "en";
  setLanguage: (val: "de" | "en") => void;
  theme: ThemePreference;
  setTheme: (val: ThemePreference) => void;
  autoStart: boolean;
  setAutoStart: (val: boolean) => void;
  autoClaim: boolean;
  setAutoClaim: (val: boolean) => void;
  autoSelect: boolean;
  setAutoSelect: (val: boolean) => void;
  autoSwitchEnabled: boolean;
  setAutoSwitchEnabled: (val: boolean) => void;
  warmupEnabled: boolean;
  setWarmupEnabled: (val: boolean) => void;
  updateChannel: UpdateChannel;
  setUpdateChannel: (val: UpdateChannel) => void;
  demoMode: boolean;
  setDemoMode: (val: boolean) => void;
  debugEnabled: boolean;
  setDebugEnabled: (val: boolean) => void;
  alertsEnabled: boolean;
  setAlertsEnabled: (val: boolean) => void;
  alertsNotifyWhileFocused: boolean;
  setAlertsNotifyWhileFocused: (val: boolean) => void;
  alertsDropClaimed: boolean;
  setAlertsDropClaimed: (val: boolean) => void;
  alertsDropEndingSoon: boolean;
  setAlertsDropEndingSoon: (val: boolean) => void;
  alertsDropEndingMinutes: number;
  setAlertsDropEndingMinutes: (val: number) => void;
  alertsWatchError: boolean;
  setAlertsWatchError: (val: boolean) => void;
  alertsAutoSwitch: boolean;
  setAlertsAutoSwitch: (val: boolean) => void;
  alertsNewDrops: boolean;
  setAlertsNewDrops: (val: boolean) => void;
  enableBadgesEmotes: boolean;
  setEnableBadgesEmotes: (val: boolean) => void;
  allowUnlinkedGames: boolean;
  setAllowUnlinkedGames: (val: boolean) => void;
  sendTestAlert: () => void;
  refreshMinMs: number;
  refreshMaxMs: number;
  setRefreshIntervals: (minMs: number, maxMs: number) => void;
  resetAutomation: () => void;
  settingsJson: string;
  setSettingsJson: (val: string) => void;
  exportSettings: () => void;
  importSettings: () => void;
  settingsInfo?: string | null;
  settingsError?: string | null;
  showUpdateCheck?: boolean;
  showAutoStart?: boolean;
  checkUpdates?: () => void;
  downloadUpdate?: () => void;
  installUpdate?: () => void;
  updateStatus?: {
    state:
      | "idle"
      | "checking"
      | "available"
      | "downloading"
      | "downloaded"
      | "none"
      | "error"
      | "unsupported";
    message?: string;
    version?: string;
    progress?: number;
    transferred?: number;
    total?: number;
    bytesPerSecond?: number;
  };
};

export function SettingsView(props: SettingsProps) {
  const { active, setActive } = useSettingsViewState("general");

  const items: { key: SettingsSectionKey; label: string }[] = [
    { key: "general", label: "general" },
    { key: "engine", label: "engine" },
    { key: "appearance", label: "appearance" },
    ...(props.showUpdateCheck ? [{ key: "updates" as SettingsSectionKey, label: "updates" }] : []),
    { key: "alerts", label: "alerts" },
    { key: "account", label: "account" },
    { key: "advanced", label: "advanced" },
  ];

  const sectionTitle: Record<SettingsSectionKey, string> = {
    general: "General",
    engine: "Engine",
    appearance: "Appearance",
    updates: "Updates",
    alerts: "Alerts",
    account: "Account",
    advanced: "Advanced",
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-[22px] font-medium tracking-[-0.01em] text-[color:var(--dp-text)] leading-tight">
          Settings
        </h2>
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--dp-text-dimmer)] mt-1">
          {sectionTitle[active]}
        </div>
      </div>

      <div className="flex gap-6 items-start">
        <SettingsSidebar items={items} active={active} onChange={setActive} />

        <main className="flex-1 min-w-0 rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-6 py-5">
          {active === "general" && (
            <GeneralSection
              language={props.language}
              setLanguage={props.setLanguage}
              demoMode={props.demoMode}
              setDemoMode={props.setDemoMode}
              sendTestAlert={props.sendTestAlert}
            />
          )}
          {active === "engine" && (
            <EngineSection
              autoStart={props.autoStart}
              setAutoStart={props.setAutoStart}
              showAutoStart={props.showAutoStart}
              autoClaim={props.autoClaim}
              setAutoClaim={props.setAutoClaim}
              autoSelect={props.autoSelect}
              setAutoSelect={props.setAutoSelect}
              autoSwitchEnabled={props.autoSwitchEnabled}
              setAutoSwitchEnabled={props.setAutoSwitchEnabled}
              warmupEnabled={props.warmupEnabled}
              setWarmupEnabled={props.setWarmupEnabled}
              refreshMinMs={props.refreshMinMs}
              refreshMaxMs={props.refreshMaxMs}
              setRefreshIntervals={props.setRefreshIntervals}
              resetAutomation={props.resetAutomation}
            />
          )}
          {active === "appearance" && (
            <AppearanceSection
              theme={props.theme}
              setTheme={props.setTheme}
              enableBadgesEmotes={props.enableBadgesEmotes}
              setEnableBadgesEmotes={props.setEnableBadgesEmotes}
            />
          )}
          {active === "updates" && props.showUpdateCheck && (
            <UpdatesSection
              updateChannel={props.updateChannel}
              setUpdateChannel={props.setUpdateChannel}
              updateStatus={props.updateStatus}
              checkUpdates={props.checkUpdates}
              downloadUpdate={props.downloadUpdate}
              installUpdate={props.installUpdate}
            />
          )}
          {active === "alerts" && (
            <AlertsSection
              alertsEnabled={props.alertsEnabled}
              setAlertsEnabled={props.setAlertsEnabled}
              alertsNotifyWhileFocused={props.alertsNotifyWhileFocused}
              setAlertsNotifyWhileFocused={props.setAlertsNotifyWhileFocused}
              alertsDropClaimed={props.alertsDropClaimed}
              setAlertsDropClaimed={props.setAlertsDropClaimed}
              alertsDropEndingSoon={props.alertsDropEndingSoon}
              setAlertsDropEndingSoon={props.setAlertsDropEndingSoon}
              alertsDropEndingMinutes={props.alertsDropEndingMinutes}
              setAlertsDropEndingMinutes={props.setAlertsDropEndingMinutes}
              alertsWatchError={props.alertsWatchError}
              setAlertsWatchError={props.setAlertsWatchError}
              alertsAutoSwitch={props.alertsAutoSwitch}
              setAlertsAutoSwitch={props.setAlertsAutoSwitch}
              alertsNewDrops={props.alertsNewDrops}
              setAlertsNewDrops={props.setAlertsNewDrops}
            />
          )}
          {active === "account" && (
            <AccountSection
              isLinked={props.isLinked}
              allowUnlinkedGames={props.allowUnlinkedGames}
              setAllowUnlinkedGames={props.setAllowUnlinkedGames}
            />
          )}
          {active === "advanced" && (
            <AdvancedSection
              debugEnabled={props.debugEnabled}
              setDebugEnabled={props.setDebugEnabled}
              settingsJson={props.settingsJson}
              setSettingsJson={props.setSettingsJson}
              exportSettings={props.exportSettings}
              importSettings={props.importSettings}
              settingsInfo={props.settingsInfo}
              settingsError={props.settingsError}
            />
          )}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: tsc + tests**

`npx tsc --noEmit | grep "SettingsView"` — empty.
`npm test | tail -5` — 214/214.

- [ ] **Step 3: Commit**

```
feat(settings): rewrite SettingsView as sidebar + section composition

Replaces the 715-line 2-column form with a 200px sidebar (7 sections)
+ scrollable main pane (current section). Section components live
under sections/ and consume thin slices of settingsProps. All ~50
settings preserved. SettingsView itself drops to ~150 lines.

Sub-sections within a section use SectionLabel headings with the
trailing rule, keeping with the Pro Console pattern from Phase 2-5.
```

---

## Task 7: EnginePanel real watch_cycle / cadence values

`src/renderer/features/overview/EnginePanel.tsx` already accepts `cycleSeconds` and `cadenceSeconds` props but they default to 30 and the parent doesn't pass real values. Plumb them through.

- [ ] **Step 1:** In `src/renderer/features/overview/OverviewView.tsx`, add to OverviewProps and forward to EnginePanel:

```tsx
type OverviewProps = {
  // ...existing
  refreshMinMs?: number;
  refreshMaxMs?: number;
  // ...
};
```

In the JSX, find `<EnginePanel lastWatchOk={lastWatchOk} />` and update:

```tsx
<EnginePanel
  lastWatchOk={lastWatchOk}
  cycleSeconds={
    typeof refreshMinMs === "number" ? Math.round(refreshMinMs / 1000) : undefined
  }
  cadenceSeconds={
    typeof refreshMaxMs === "number" ? Math.round(refreshMaxMs / 1000) : undefined
  }
/>
```

Add `refreshMinMs`, `refreshMaxMs` to the destructure (mark unused if not).

- [ ] **Step 2:** In `src/renderer/App.tsx`, find the `overviewPropsExtended` useMemo. Add the two values:

```tsx
const overviewPropsExtended = React.useMemo(
  () => ({
    ...overviewProps,
    onPause: controlProps.stopWatching,
    onSwitchTarget: () => navProps.setView("priorities"),
    refreshMinMs: settingsProps.refreshMinMs,
    refreshMaxMs: settingsProps.refreshMaxMs,
  }),
  [overviewProps, controlProps.stopWatching, navProps, settingsProps.refreshMinMs, settingsProps.refreshMaxMs],
);
```

(Note: `settingsProps` might need to be destructured from `model` — confirm the existing path. If `settingsProps` isn't in scope, pull it from `model.settingsProps`.)

- [ ] **Step 3:** tsc clean + commit:

```
feat(overview): EnginePanel reads real refresh cadence from settings

Replaces the 30s hardcoded cycleSeconds/cadenceSeconds with the real
refreshMinMs / refreshMaxMs values from settingsProps. Plumbed via
App.tsx -> overviewPropsExtended -> OverviewView -> EnginePanel.
```

---

## Task 8: Stabilize `navProps.setView` via useCallback

The Phase 5 final review flagged that `overviewPropsExtended` invalidates every render because `navProps` is rebuilt every render in `useAppModel`. Fix by ensuring `setView` itself is a stable reference.

- [ ] **Step 1:** Read `src/renderer/shared/hooks/app/useAppModel.ts` around the line where `navProps = { view, setView, ... }` is built and where `setView` is defined.

- [ ] **Step 2:** If `setView` is a plain function (e.g., from `useState`), it's already stable. The issue is `navProps` itself being a new object. Two paths:
  - Wrap `navProps` in `useMemo` with stable deps so it has a stable identity
  - Or change App.tsx's `overviewPropsExtended` to depend only on `navProps.setView` (the stable bit) rather than the whole navProps object

Path B is simpler. Edit App.tsx:

```tsx
const setView = navProps.setView;
const overviewPropsExtended = React.useMemo(
  () => ({
    ...overviewProps,
    onPause: controlProps.stopWatching,
    onSwitchTarget: () => setView("priorities"),
    refreshMinMs: settingsProps.refreshMinMs,
    refreshMaxMs: settingsProps.refreshMaxMs,
  }),
  [overviewProps, controlProps.stopWatching, setView, settingsProps.refreshMinMs, settingsProps.refreshMaxMs],
);
```

- [ ] **Step 3:** tsc + tests pass, commit:

```
fix(app): stabilize overviewPropsExtended via navProps.setView dep

Was depending on the whole navProps object (rebuilt every render),
causing the memo to invalidate constantly and creating new
onSwitchTarget closures on every parent render. Depending on
navProps.setView (a stable useState setter) instead.

Resolves the Phase 5 final-review note about overviewPropsExtended
memo invalidation.
```

---

## Task 9: Verify end-to-end

- [ ] **Step 1: Lint, TSC, tests, build**

- `npm run lint` — exit 0
- `npx tsc --noEmit` — no new errors (Phase 5 baseline ~18 pre-existing)
- `npm test` — 214/214
- `npm run format` — commit if anything reformatted
- `npm run build` — exit 0

- [ ] **Step 2: Branch summary**

`git log --oneline feat/design-overhaul-phase-5-polish..HEAD`

Expected ~13 commits (plan + 7 section files + SettingsView rewrite + EnginePanel plumbing + navProps fix + optional format commit).

## Report

Per phase task: SHAs. Final: full branch log, lint/tsc/test/build results, concerns if any.

---

## Out of Scope

- HeroPanel claim-now button wiring — needs claim engine surfacing through useAppModel which is bigger than this PR. Stays a placeholder.
- Restore Control tracker status section — Phase 7 (with the broader Control diagnostics revisit)
- Light-mode visual sweep for Settings — Phase 7 polish
- Material Symbols removal — Phase 7 cleanup
- Legacy CSS deletion — Phase 7 cleanup
- i18n keys for new Settings copy — Phase 7 i18n sweep

## Open items

- Settings JSON textarea doesn't have syntax highlighting / validation. Acceptable as-is; can add `react-codemirror` or similar in a future polish if needed.
- Account section is minimal (link status display only). A "Switch account" / "Re-login" button could be added when the auth flow has those entry points.
- SettingsSidebar doesn't show counts per section. The plan describes optional counts but I dropped them to keep things simple. Can add later if user wants.

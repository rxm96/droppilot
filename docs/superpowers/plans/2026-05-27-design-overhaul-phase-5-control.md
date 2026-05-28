# Design Overhaul — Phase 5: Control View Migration + HeroPanel Action Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate `ControlView` (1288 lines) to the design overhaul pattern — composition of 4 new sub-panels (EngineStatusPanel, ActiveSessionPanel, ChannelGridPanel, CampaignsPanel) using Phase 1 primitives and `--dp-*` tokens. Preserve all business logic by keeping `useControlViewState` (546 lines) unchanged. Additionally wire the HeroPanel's previously-placeholder quick-action buttons (pause → `stopWatching`, switch → navigate to Priorities) and i18n the Statusbar engine label.

**Architecture:** Extract the watch-engine label/why/next/suppression/blocking-reason mapping functions from `ControlView.tsx` (lines 25–243) into a new `controlHelpers.ts` module so the new sub-panels can consume them independently. The existing `useControlViewState` hook is unchanged — it already encapsulates the channel grid animation, live progress tracking, campaign grouping, and change detection. New sub-panels each consume a focused slice of the hook's return value + a subset of `ControlProps`. `ControlView.tsx` becomes a slim composition that wires `useControlViewState` to the new panels.

**Tech Stack:** React 19, Tailwind 4 `--dp-*` tokens, Phase 1 primitives (Card, Pill, Stat, SectionLabel, Button, Table), Phase 2 formatters (`formatHourMinute`, `formatPercent`, `formatRelative`, `formatRemainingFromEta`), Phase 1 `lucide-react` icons.

**Spec reference:** [`../specs/2026-05-27-design-overhaul-design.md`](../specs/2026-05-27-design-overhaul-design.md) §7.4 Control.

**Branch:** `feat/design-overhaul-phase-5-control` (stacked on `feat/design-overhaul-phase-4-priorities-control`)

**PR target:** `feat/design-overhaul-phase-4-priorities-control` — GitHub auto-retargets up the chain as underlying PRs merge.

### Locked design decisions

1. **Composition, not full rewrite of logic.** `useControlViewState` stays — it's the data layer. Phase 5 only rewrites the rendering layer.
2. **Preserve all existing Control functionality:** watch engine status disclosure (collapsible), active stream card, active drop progress, campaign grouping with tabs, live channel grid with viewer animation, tracker status, watch errors, claim status, refresh button. None of these features are dropped; they're restyled into new panels.
3. **No "Manual Override" or "Event log" panel** (spec §7.4 mentions both): both are *new features* not present in the existing Control. They're out of scope for Phase 5; can be added in future polish if/when needed.
4. **Layout:** single-column flow with sections stacked top-to-bottom, NOT the existing 2-column grid. The new chrome already provides max-width and padding; the legacy `control-layout` 2-col grid was visual filler. Single-column scales better at narrow widths and matches Phase 2 Overview's information density.
5. **HeroPanel wiring scope:** `pause` and `switch target` get real handlers; `claim now` stays disabled this phase (the claim action requires per-drop dispatch through the inventory claim engine, which is out of scope for HeroPanel surface).
6. **i18n keys for Statusbar:** add 4 new keys (`statusbar.engine.running` / `paused` / `idle` / `standby`) and migrate the App.tsx hardcoded strings.

### Deviations from spec

1. **No "Manual Override" panel** (see decision #3) — out of scope.
2. **No "Event log" panel** (see decision #3) — out of scope.
3. **Channel grid** is not in the spec but exists in current Control and is operationally critical for the user to see live streams; preserved as `ChannelGridPanel`.
4. **Campaigns panel** is not in the spec but provides per-drop context that current users rely on; preserved as `CampaignsPanel`.
5. **EnginePanel** in Overview still uses hardcoded `30s` for cycle/cadence — surfacing real values requires plumbing through useAppModel which is bigger than Phase 5 scope. Tracked as Phase 6 work.

---

## File Structure

**New files:**
- `src/renderer/features/control/controlHelpers.ts` — watch-engine label/details/suppression + blocking-reason helpers (extracted from ControlView)
- `src/renderer/features/control/EngineStatusPanel.tsx` — watch engine status: badge + decision label + why/next + suppression/cooldowns/no-progress detail (collapsible)
- `src/renderer/features/control/ActiveSessionPanel.tsx` — currently-watched stream card + active drop progress + ETA
- `src/renderer/features/control/ChannelGridPanel.tsx` — live channel grid (preserves useControlViewState animations)
- `src/renderer/features/control/CampaignsPanel.tsx` — campaign tabs + drop list

**Modified files:**
- `src/renderer/features/control/ControlView.tsx` — full rewrite as composition (1288 → ~250 lines)
- `src/renderer/features/overview/HeroPanel.tsx` — accept `onPause` + `onSwitchTarget` callbacks, wire to buttons (claim stays placeholder)
- `src/renderer/features/overview/OverviewView.tsx` — accept the 2 new callbacks, forward to HeroPanel
- `src/renderer/App.tsx` — pass `onPause = controlProps.stopWatching` + `onSwitchTarget = () => navProps.setView("priorities")` into overviewProps spread to OverviewView
- `src/renderer/shared/hooks/app/useAppModel.ts` — extend `overviewProps` shape with the 2 new callbacks (or pass them at the App.tsx layer — see Task 7 for the chosen path)
- `src/renderer/shared/i18n/*` — add 4 statusbar engine label keys

**Untouched (intentionally):**
- `src/renderer/features/control/useControlViewState.ts` — 546-line state hook stays exactly as-is
- Phase 1/2/3/4 primitives and chrome — used as-is
- All other features (Inventory, Priorities, Settings, Debug) — unchanged

---

## Data Mapping Reference

### Watch engine tone (existing semantics)

```
decision                       → tone
watching-progress              → ok
idle-ready                     → ok
suppressed                     → hold (mapped to warn)
cooldown                       → hold (mapped to warn)
idle-loading-channels          → neutral (mapped to dim)
no-target                      → neutral (mapped to dim)
* (all other watching-* + idle-*) → warn
```

### EngineStatusPanel layout

```
┌─────────────────────────────────────────────┐
│ ENGINE STATUS                       [▼]     │  ← SectionLabel inline + chevron
├─────────────────────────────────────────────┤
│ ◉ watching-progress                         │  ← LED dot + decision label (big sans)
│ Why: <why text>                             │  ← mono dim
│ Next: <next text>                           │  ← mono dim
├─────────────────────────────────────────────┤  ← only when expanded
│ target          rust                        │
│ suppression     none                        │
│ cooldowns       none                        │
│ allowlist       on (2 of 14 channels)       │
│ no-progress     2 attempts, 4m 12s          │
└─────────────────────────────────────────────┘
```

### ActiveSessionPanel layout

```
┌────────────────────────────────────────────────────────┐
│ NOW WATCHING                          last ping · 8s   │
├────────────┬───────────────────────────────────────────┤
│ [thumb]    │ Channel name (sans, 17px)                 │
│  160x90    │ game · twitch.tv/login                    │
│            │ ◉ live · 14,247 viewers                   │
├────────────┴───────────────────────────────────────────┤
│ ACTIVE DROP                                             │
│ Drop title (sans, 15px)                                 │
│ ━━━━━━━━━━━━━━━░░░░░░░  87%                            │
│ 02:14 watched · 02:30 required · eta 02:14:38           │
└─────────────────────────────────────────────────────────┘
```

### CampaignsPanel layout

```
┌──────────────────────────────────────────┐
│ CAMPAIGNS · 3                            │
├──────────────────────────────────────────┤
│ [Twitch Rivals] [Spring Drop] [Major]    │  ← campaign tabs (Pills, active = accent)
├──────────────────────────────────────────┤
│ Drop 1                  100% · claimed   │
│ Drop 2                  ████░░░  72%     │
│ Drop 3                  ░░░░░░░  0%      │
└──────────────────────────────────────────┘
```

### ChannelGridPanel layout

```
┌────────────────────────────────────────────────────┐
│ LIVE CHANNELS · 12                       [refresh] │
├────────────────────────────────────────────────────┤
│ ┌──────────┐  ┌──────────┐  ┌──────────┐  …       │
│ │  thumb   │  │  thumb   │  │  thumb   │           │
│ │  14.2K   │  │  8.4K    │  │  2.3K    │           │
│ │ rust     │  │ rust     │  │ rust     │           │
│ │ shroud   │  │ tarik    │  │ s1mple   │           │
│ │ title…   │  │ title…   │  │ title…   │           │
│ └──────────┘  └──────────┘  └──────────┘           │
└────────────────────────────────────────────────────┘
```

---

## Task 1: Extract `controlHelpers.ts`

Move the 4 watch-engine + 2 blocking-reason helpers from `ControlView.tsx` (module-level functions, lines 25–243) into a dedicated module. Pure functions, no React.

**Files:**
- Create: `src/renderer/features/control/controlHelpers.ts`

- [ ] **Step 1: Create the file**

```ts
import type { InventoryItem, WatchingState } from "@renderer/shared/types";
import { DropChannelRestriction } from "@renderer/shared/domain/dropDomain";

export type WatchEngineDecision =
  | "no-target"
  | "suppressed"
  | "cooldown"
  | "watching-progress"
  | "watching-recover"
  | "watching-no-farmable"
  | "watching-no-watchable"
  | "idle-loading-channels"
  | "idle-no-channels"
  | "idle-ready"
  | "idle-no-watchable-drops";

export type WatchEngineSuppressionReason = "manual-stop" | "stall-stop";

export type WatchEngineTone = "ok" | "warn" | "neutral" | "hold";

export type Translator = (key: string, vars?: Record<string, string | number>) => string;

/** Map decision to UI tone (drives status indicator color). */
export const watchEngineTone = (decision: WatchEngineDecision): WatchEngineTone => {
  switch (decision) {
    case "watching-progress":
    case "idle-ready":
      return "ok";
    case "suppressed":
    case "cooldown":
      return "hold";
    case "idle-loading-channels":
    case "no-target":
      return "neutral";
    default:
      return "warn";
  }
};

export const mapWatchEngineDecisionLabel = (
  decision: WatchEngineDecision,
  suppressionReason: WatchEngineSuppressionReason | null,
  t: Translator,
): string => {
  switch (decision) {
    case "no-target":
      return t("control.watchEngineDecision.noTarget");
    case "suppressed":
      if (suppressionReason === "manual-stop") {
        return t("control.watchEngineDecision.suppressedManualStop");
      }
      return t("control.watchEngineDecision.suppressed");
    case "cooldown":
      return t("control.watchEngineDecision.cooldown");
    case "watching-progress":
      return t("control.watchEngineDecision.watchingProgress");
    case "watching-recover":
      return t("control.watchEngineDecision.watchingRecover");
    case "watching-no-farmable":
      return t("control.watchEngineDecision.watchingNoFarmable");
    case "watching-no-watchable":
      return t("control.watchEngineDecision.watchingNoWatchable");
    case "idle-loading-channels":
      return t("control.watchEngineDecision.idleLoadingChannels");
    case "idle-no-channels":
      return t("control.watchEngineDecision.idleNoChannels");
    case "idle-ready":
      return t("control.watchEngineDecision.idleReady");
    case "idle-no-watchable-drops":
      return t("control.watchEngineDecision.idleNoWatchableDrops");
    default:
      return decision;
  }
};

export const mapWatchEngineSuppressionReasonLabel = (
  reason: WatchEngineSuppressionReason,
  t: Translator,
): string => {
  switch (reason) {
    case "manual-stop":
      return t("control.watchEngineSuppression.manualStop");
    case "stall-stop":
      return t("control.watchEngineSuppression.stallStop");
    default:
      return reason;
  }
};

export const mapWatchEngineDecisionDetails = (
  decision: WatchEngineDecision,
  suppressionReason: WatchEngineSuppressionReason | null,
  t: Translator,
): { why: string; next: string } => {
  switch (decision) {
    case "no-target":
      return {
        why: t("control.watchEngineWhy.noTarget"),
        next: t("control.watchEngineNext.noTarget"),
      };
    case "suppressed":
      if (suppressionReason === "manual-stop") {
        return {
          why: t("control.watchEngineWhy.suppressedManualStop"),
          next: t("control.watchEngineNext.suppressedManualStop"),
        };
      }
      return {
        why: t("control.watchEngineWhy.suppressed"),
        next: t("control.watchEngineNext.suppressed"),
      };
    case "cooldown":
      return {
        why: t("control.watchEngineWhy.cooldown"),
        next: t("control.watchEngineNext.cooldown"),
      };
    case "watching-progress":
      return {
        why: t("control.watchEngineWhy.watchingProgress"),
        next: t("control.watchEngineNext.watchingProgress"),
      };
    case "watching-recover":
      return {
        why: t("control.watchEngineWhy.watchingRecover"),
        next: t("control.watchEngineNext.watchingRecover"),
      };
    case "watching-no-farmable":
      return {
        why: t("control.watchEngineWhy.watchingNoFarmable"),
        next: t("control.watchEngineNext.watchingNoFarmable"),
      };
    case "watching-no-watchable":
      return {
        why: t("control.watchEngineWhy.watchingNoWatchable"),
        next: t("control.watchEngineNext.watchingNoWatchable"),
      };
    case "idle-loading-channels":
      return {
        why: t("control.watchEngineWhy.idleLoadingChannels"),
        next: t("control.watchEngineNext.idleLoadingChannels"),
      };
    case "idle-no-channels":
      return {
        why: t("control.watchEngineWhy.idleNoChannels"),
        next: t("control.watchEngineNext.idleNoChannels"),
      };
    case "idle-ready":
      return {
        why: t("control.watchEngineWhy.idleReady"),
        next: t("control.watchEngineNext.idleReady"),
      };
    case "idle-no-watchable-drops":
      return {
        why: t("control.watchEngineWhy.idleNoWatchableDrops"),
        next: t("control.watchEngineNext.idleNoWatchableDrops"),
      };
    default:
      return { why: decision, next: decision };
  }
};

/** Format a millisecond duration as compact "Xh YYm" / "Xm YYs". */
export const formatDurationMs = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
};

/** Blocking reason helpers (preserved from ControlView). */
export const formatBlockingReason = (reason: string | undefined, t: Translator): string => {
  if (!reason) return t("inventory.blockReason.unknown");
  if (reason.startsWith("missing_prerequisite_drops:")) {
    const ids = reason.slice("missing_prerequisite_drops:".length).trim();
    return t("inventory.blockReason.missingPrerequisites", { ids: ids || "?" });
  }
  switch (reason) {
    case "account_not_linked":
      return t("inventory.blockReason.accountNotLinked");
    case "campaign_not_started":
      return t("inventory.blockReason.campaignNotStarted");
    case "campaign_expired":
      return t("inventory.blockReason.campaignExpired");
    case "campaign_allow_disabled":
      return t("inventory.blockReason.campaignNotEligible");
    case "preconditions_not_met":
      return t("inventory.blockReason.preconditionsNotMet");
    case "missing_drop_instance_id":
      return t("inventory.blockReason.missingDropInstance");
    case "claim_window_closed":
      return t("inventory.blockReason.claimWindowClosed");
    default:
      return t("inventory.blockReason.unknown");
  }
};

export const pickDisplayBlockingReason = (reasons: string[]): string | undefined => {
  const cleaned = reasons
    .map((reason) => (typeof reason === "string" ? reason.trim() : ""))
    .filter(Boolean);
  return cleaned[0];
};

/** Whether a drop can progress given the channel currently being watched. */
export const canDropProgressOnWatchingChannel = (
  drop: InventoryItem,
  watching: WatchingState,
): boolean => {
  if (!watching) return true;
  const restriction = DropChannelRestriction.fromInventoryItem(drop);
  return restriction.allowsWatching(watching);
};

/** Format a channel-restricted drop's reason text with allowed-login preview. */
export const formatChannelRestrictionReason = (drop: InventoryItem, t: Translator): string => {
  const allowedLogins = Array.from(DropChannelRestriction.fromInventoryItem(drop).logins);
  if (allowedLogins.length > 0) {
    const preview = allowedLogins
      .slice(0, 3)
      .map((login) => `@${login}`)
      .join(", ");
    return t("control.dropReason.channelRestrictedChannels", { channels: preview });
  }
  return t("control.dropReason.channelRestricted");
};
```

- [ ] **Step 2: Verify tsc clean + commit**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "controlHelpers" | head -5
# expected: empty

git add src/renderer/features/control/controlHelpers.ts
git commit -m "feat(control): extract controlHelpers module

Pulls watch-engine + blocking-reason + channel-restriction helpers
out of ControlView (formerly lines 25-243) into a dedicated module.
Pure functions with a Translator type for the t() parameter. No
behavior change; the helpers will be consumed by the new Phase 5
sub-panels (EngineStatusPanel, ActiveSessionPanel, CampaignsPanel)
and by the rewritten ControlView."
```

---

## Task 2: Create `EngineStatusPanel.tsx`

The watch engine status disclosure. Shows decision label + why/next + collapsible details (target, suppression, cooldowns, allowlist, no-progress).

**Files:**
- Create: `src/renderer/features/control/EngineStatusPanel.tsx`

- [ ] **Step 1: Create the file**

```tsx
import * as React from "react";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { Pill } from "@renderer/shared/components/ui/pill";
import { ChevronDown } from "@renderer/shared/lib/icons";
import { cn } from "@renderer/shared/lib/utils";
import { useI18n } from "@renderer/shared/i18n";
import {
  formatDurationMs,
  mapWatchEngineDecisionDetails,
  mapWatchEngineDecisionLabel,
  mapWatchEngineSuppressionReasonLabel,
  watchEngineTone,
  type WatchEngineDecision,
  type WatchEngineSuppressionReason,
} from "./controlHelpers";

export type EngineStatusPanelProps = {
  decision: WatchEngineDecision;
  targetGame: string;
  activeTargetGame: string;
  suppression: {
    game: string;
    reason: WatchEngineSuppressionReason;
    sinceAt: number | null;
    holdRemainingMs: number;
  } | null;
  activeCooldowns: Array<{ game: string; until: number; remainingMs: number }>;
  allowlistActive: boolean;
  allowlistedLiveChannels: number;
  totalLiveChannels: number;
  noProgressTracker: { recoveryCount: number; sinceProgressMs: number } | null;
};

const TONE_DOT: Record<ReturnType<typeof watchEngineTone>, string> = {
  ok: "var(--dp-signal-ok)",
  warn: "var(--dp-signal-warn)",
  hold: "var(--dp-signal-warn)",
  neutral: "var(--dp-text-dimmer)",
};

const TONE_PILL: Record<ReturnType<typeof watchEngineTone>, "ok" | "warn" | "dim"> = {
  ok: "ok",
  warn: "warn",
  hold: "warn",
  neutral: "dim",
};

export function EngineStatusPanel(props: EngineStatusPanelProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = React.useState(false);
  const tone = watchEngineTone(props.decision);
  const suppressionReason = props.suppression?.reason ?? null;
  const label = mapWatchEngineDecisionLabel(props.decision, suppressionReason, t);
  const details = mapWatchEngineDecisionDetails(props.decision, suppressionReason, t);

  const targetText =
    props.targetGame ||
    (props.suppression && props.activeTargetGame && !props.targetGame
      ? `${props.activeTargetGame} (${t("control.watchEngineTargetSuppressed")})`
      : props.activeTargetGame) ||
    t("control.noTarget");

  const suppressionText = props.suppression
    ? `${props.suppression.game} (${mapWatchEngineSuppressionReasonLabel(props.suppression.reason, t)})${
        props.suppression.holdRemainingMs > 0
          ? `, ${t("control.watchEngineHold", { time: formatDurationMs(props.suppression.holdRemainingMs) })}`
          : ""
      }`
    : t("control.watchEngineNoSuppression");

  const cooldownText =
    props.activeCooldowns.length > 0
      ? props.activeCooldowns
          .slice(0, 3)
          .map((c) => `${c.game} (${formatDurationMs(c.remainingMs)})`)
          .join(" | ")
      : t("control.watchEngineNoCooldowns");

  const allowlistText = props.allowlistActive
    ? t("control.watchEngineAllowlistOn")
    : t("control.watchEngineAllowlistOff");

  const channelsText = t("control.watchEngineChannelsHint", {
    eligible: props.allowlistedLiveChannels,
    total: props.totalLiveChannels,
  });

  const noProgressText = props.noProgressTracker
    ? t("control.watchEngineNoProgressValue", {
        attempts: props.noProgressTracker.recoveryCount,
        time: formatDurationMs(props.noProgressTracker.sinceProgressMs),
      })
    : null;

  return (
    <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between px-5 py-4 hover:bg-[color:var(--dp-bg-elevated-2)] transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            aria-hidden="true"
            className="inline-block h-[6px] w-[6px] rounded-full flex-shrink-0"
            style={{
              background: TONE_DOT[tone],
              boxShadow:
                tone === "ok"
                  ? "0 0 8px var(--dp-accent-glow)"
                  : tone === "warn" || tone === "hold"
                    ? "0 0 6px rgba(251,191,36,0.5)"
                    : undefined,
            }}
          />
          <div className="flex flex-col items-start min-w-0">
            <SectionLabel inline>engine status</SectionLabel>
            <div className="text-[15px] font-medium text-[color:var(--dp-text)] mt-1 truncate">
              {label}
            </div>
          </div>
        </div>
        <ChevronDown
          size={14}
          strokeWidth={1.8}
          className={cn(
            "text-[color:var(--dp-text-dimmer)] transition-transform flex-shrink-0",
            expanded && "rotate-180",
          )}
        />
      </button>

      <div className="px-5 pb-4">
        <div className="grid gap-1.5">
          <div className="flex gap-3 font-mono text-[11px]">
            <span className="text-[color:var(--dp-text-dimmer)] w-12 flex-shrink-0">why</span>
            <span className="text-[color:var(--dp-text-dim)] flex-1">{details.why}</span>
          </div>
          <div className="flex gap-3 font-mono text-[11px]">
            <span className="text-[color:var(--dp-text-dimmer)] w-12 flex-shrink-0">next</span>
            <span className="text-[color:var(--dp-text-dim)] flex-1">{details.next}</span>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[color:var(--dp-border-soft)] px-5 py-4 grid gap-2">
          <DetailRow label="target" value={targetText} />
          <DetailRow label="suppression" value={suppressionText} />
          <DetailRow label="cooldowns" value={cooldownText} />
          <DetailRow
            label="allowlist"
            value={allowlistText}
            sub={channelsText}
          />
          {noProgressText && <DetailRow label="no-progress" value={noProgressText} tone="warn" />}
        </div>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "warn";
}) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: "120px 1fr" }}>
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--dp-text-dimmer)] pt-0.5">
        {label}
      </span>
      <div className="min-w-0">
        <div
          className={cn(
            "font-mono text-[11px]",
            tone === "warn" ? "text-[color:var(--dp-signal-warn)]" : "text-[color:var(--dp-text)]",
          )}
        >
          {value}
        </div>
        {sub && (
          <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] mt-0.5">
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify tsc clean + commit**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "EngineStatusPanel" | head -5
# expected: empty

git add src/renderer/features/control/EngineStatusPanel.tsx
git commit -m "feat(control): add EngineStatusPanel collapsible status

Replaces the legacy .control-watch-engine details/summary with a
button-controlled panel. Always-visible header: tone dot (ok/warn
/hold/neutral) + 'engine status' eyebrow + big decision label.
Always-visible body: 2-row why/next mono grid. Click chevron to
expand the detail block (target, suppression, cooldowns, allowlist
with channel count, optional no-progress recovery stats)."
```

---

## Task 3: Create `ActiveSessionPanel.tsx`

The "now watching" stream card + active drop progress.

**Files:**
- Create: `src/renderer/features/control/ActiveSessionPanel.tsx`

- [ ] **Step 1: Create the file**

```tsx
import * as React from "react";
import type { ChannelEntry, WatchingState } from "@renderer/shared/types";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { Pill } from "@renderer/shared/components/ui/pill";
import { useI18n } from "@renderer/shared/i18n";
import {
  formatHourMinute,
  formatPercent,
  formatRelative,
} from "@renderer/features/overview/formatters";

export type ActiveSessionPanelProps = {
  watching: WatchingState;
  activeChannel: ChannelEntry | null;
  activeThumb: string | null;
  activeLoginMismatch: string | null;
  activeDropTitle: string | null;
  activeDropEarnedMinutes: number;
  activeDropRequiredMinutes: number;
  activeEtaText: string | null;
  lastWatchOk?: number;
};

export function ActiveSessionPanel({
  watching,
  activeChannel,
  activeThumb,
  activeLoginMismatch,
  activeDropTitle,
  activeDropEarnedMinutes,
  activeDropRequiredMinutes,
  activeEtaText,
  lastWatchOk,
}: ActiveSessionPanelProps) {
  const { t } = useI18n();

  const isWatching = !!watching;
  const channelDisplay = activeChannel?.displayName ?? watching?.name ?? "—";
  const channelLogin = activeChannel?.login ?? watching?.login ?? "";
  const channelGame = activeChannel?.game ?? watching?.game ?? "";
  const viewers = activeChannel?.viewers ?? 0;

  const progressPct =
    activeDropRequiredMinutes > 0
      ? Math.round((activeDropEarnedMinutes / activeDropRequiredMinutes) * 100)
      : 0;

  return (
    <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)]">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[color:var(--dp-border-soft)]">
        <SectionLabel inline>{isWatching ? "now watching" : "no active session"}</SectionLabel>
        {lastWatchOk && (
          <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
            last ping · {formatRelative(lastWatchOk)}
          </div>
        )}
      </div>

      <div className="px-5 py-5">
        {/* Stream card */}
        <div className="flex gap-4 mb-5">
          <div className="w-[160px] h-[90px] rounded-[var(--dp-radius-md)] overflow-hidden border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated-2)] flex-shrink-0">
            {activeThumb ? (
              <img
                src={activeThumb}
                alt=""
                loading="lazy"
                className="block w-full h-full object-cover"
              />
            ) : (
              <div className="flex items-center justify-center h-full font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
                {isWatching ? "loading…" : "no stream"}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-medium text-[color:var(--dp-text)] mb-1 truncate">
              {channelDisplay}
            </div>
            <div className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)] mb-2 truncate">
              {channelGame || "—"}
              {channelLogin && (
                <>
                  {" · "}
                  twitch.tv/{channelLogin}
                </>
              )}
            </div>
            {isWatching ? (
              <div className="flex items-center gap-2">
                <Pill tone="accent" dot>
                  live
                </Pill>
                {viewers > 0 && (
                  <span className="font-mono text-[11px] text-[color:var(--dp-text-dim)] tabular-nums">
                    {viewers.toLocaleString()} viewers
                  </span>
                )}
              </div>
            ) : (
              <Pill tone="dim">paused</Pill>
            )}
            {activeLoginMismatch && (
              <div className="mt-2 font-mono text-[10px] text-[color:var(--dp-signal-warn)]">
                {t("control.streamLoginMismatch", { login: activeLoginMismatch })}
              </div>
            )}
          </div>
        </div>

        {/* Active drop */}
        {activeDropTitle ? (
          <div className="border-t border-[color:var(--dp-border-soft)] pt-4">
            <SectionLabel>active drop</SectionLabel>
            <div className="mt-2 text-[15px] font-medium text-[color:var(--dp-text)] mb-2">
              {activeDropTitle}
            </div>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="flex-1 h-[4px] rounded-[2px] bg-[color:var(--dp-border)] overflow-hidden">
                <div
                  className="h-full"
                  style={{
                    width: `${Math.max(0, Math.min(100, progressPct))}%`,
                    background:
                      "linear-gradient(90deg, var(--dp-accent), #c4b5fd)",
                    boxShadow: "0 0 8px var(--dp-accent-glow)",
                  }}
                />
              </div>
              <span className="font-mono text-[12px] text-[color:var(--dp-text)] tabular-nums">
                {formatPercent(progressPct)}
              </span>
            </div>
            <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
              {formatHourMinute(activeDropEarnedMinutes)} watched ·{" "}
              {activeDropRequiredMinutes > 0
                ? formatHourMinute(activeDropRequiredMinutes)
                : "—"}{" "}
              required
              {activeEtaText && ` · eta ${activeEtaText}`}
            </div>
          </div>
        ) : (
          <div className="border-t border-[color:var(--dp-border-soft)] pt-4 font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
            {isWatching ? "no farmable drop on this channel" : "engine idle"}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify tsc clean + commit**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "ActiveSessionPanel" | head -5
# expected: empty

git add src/renderer/features/control/ActiveSessionPanel.tsx
git commit -m "feat(control): add ActiveSessionPanel for watching state

Shows the currently-watched channel as a 160x90 thumb + name + game
+ twitch.tv/login + live/paused pill + viewers. Plus an active-drop
block underneath: title + progress bar with violet glow + percent +
watched/required minutes + eta. Login mismatch warning when watcher
identity differs from active channel."
```

---

## Task 4: Create `ChannelGridPanel.tsx`

Live channel tiles. Preserves useControlViewState's animation state (combinedChannels, animatedViewersById, channelChangedIds, channelGridStateClass).

**Files:**
- Create: `src/renderer/features/control/ChannelGridPanel.tsx`

- [ ] **Step 1: Create the file**

```tsx
import * as React from "react";
import type { ChannelEntry, ErrorInfo } from "@renderer/shared/types";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { Button } from "@renderer/shared/components/ui/button";
import { Pill } from "@renderer/shared/components/ui/pill";
import { RotateCw } from "@renderer/shared/lib/icons";
import { useI18n } from "@renderer/shared/i18n";
import { cn } from "@renderer/shared/lib/utils";
import { resolveErrorMessage } from "@renderer/shared/utils/errors";

type CombinedChannel = ChannelEntry & { exiting?: boolean };

export type ChannelGridPanelProps = {
  channels: CombinedChannel[];
  animatedViewersById: Record<string, number>;
  channelChangedIds: Set<string>;
  channelsLoading: boolean;
  channelsRefreshing: boolean;
  channelError: ErrorInfo | null;
  showChannelSkeleton: boolean;
  targetGame: string;
  onStartWatching: (ch: ChannelEntry) => void;
  watchingChannelId?: string;
  onRefresh: () => void;
};

const SKELETON_TILES = Array.from({ length: 6 }, (_, i) => i);

export function ChannelGridPanel({
  channels,
  animatedViewersById,
  channelChangedIds,
  channelsLoading,
  channelsRefreshing,
  channelError,
  showChannelSkeleton,
  targetGame,
  onStartWatching,
  watchingChannelId,
  onRefresh,
}: ChannelGridPanelProps) {
  const { t } = useI18n();
  const errorText = channelError ? resolveErrorMessage(t, channelError) : null;
  const refreshDisabled = channelsLoading || channelsRefreshing;

  return (
    <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)]">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[color:var(--dp-border-soft)]">
        <div className="flex items-center gap-3">
          <SectionLabel inline>live channels</SectionLabel>
          <span className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
            · {channels.filter((c) => !c.exiting).length}
          </span>
        </div>
        <Button
          variant="dp-ghost"
          size="dp-sm"
          onClick={onRefresh}
          disabled={refreshDisabled}
          title="Refresh channel list"
        >
          <RotateCw
            size={11}
            strokeWidth={1.8}
            className={channelsRefreshing ? "animate-spin" : undefined}
          />
          refresh
        </Button>
      </div>

      <div className="p-4">
        {errorText && (
          <div className="rounded-[var(--dp-radius-md)] border border-[rgba(248,113,113,0.30)] bg-[rgba(248,113,113,0.08)] px-3 py-2 text-[11px] text-[color:var(--dp-signal-err)] mb-3">
            {errorText}
          </div>
        )}

        {showChannelSkeleton ? (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}
            aria-hidden="true"
          >
            {SKELETON_TILES.map((i) => (
              <div
                key={i}
                className="h-[140px] rounded-[var(--dp-radius-md)] bg-[color:var(--dp-bg-elevated-2)] animate-pulse"
              />
            ))}
          </div>
        ) : channels.length === 0 && !channelsLoading ? (
          <div className="text-center py-8 font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
            {targetGame
              ? t("control.channelsEmpty")
              : "select a target game in Priorities to see live channels"}
          </div>
        ) : (
          <ul
            className="grid gap-3 list-none p-0 m-0"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}
          >
            {channels.map((channel) => {
              const isWatching = channel.id === watchingChannelId;
              const isExiting = !!channel.exiting;
              const animated = animatedViewersById[channel.id] ?? channel.viewers;
              const changed = channelChangedIds.has(channel.id);
              return (
                <li key={channel.id}>
                  <button
                    type="button"
                    onClick={() => !isExiting && onStartWatching(channel)}
                    disabled={isExiting || isWatching}
                    className={cn(
                      "block w-full text-left rounded-[var(--dp-radius-md)] border bg-[color:var(--dp-bg-elevated-2)] overflow-hidden transition-all",
                      "border-[color:var(--dp-border)]",
                      !isWatching && !isExiting && "hover:border-[color:var(--dp-accent-soft)] hover:bg-[color:var(--dp-bg-elevated)]",
                      isWatching &&
                        "border-[color:var(--dp-accent)] bg-[color:var(--dp-accent-soft)] cursor-default",
                      isExiting && "opacity-30 pointer-events-none",
                      changed && "ring-1 ring-[color:var(--dp-accent-soft)]",
                    )}
                  >
                    <div className="relative aspect-[16/9] w-full bg-[color:var(--dp-bg-app)]">
                      {channel.thumbnail && (
                        <img
                          src={channel.thumbnail}
                          alt=""
                          loading="lazy"
                          className="block w-full h-full object-cover"
                        />
                      )}
                      <span className="absolute bottom-1 right-1">
                        <Pill tone="dim">{Math.round(animated).toLocaleString()}</Pill>
                      </span>
                      {isWatching && (
                        <span className="absolute top-1 left-1">
                          <Pill tone="accent" dot>
                            watching
                          </Pill>
                        </span>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] uppercase tracking-[0.08em] truncate">
                        {channel.game}
                      </div>
                      <div className="text-[13px] font-medium text-[color:var(--dp-text)] truncate mt-0.5">
                        {channel.displayName}
                      </div>
                      {channel.title && (
                        <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] truncate mt-1">
                          {channel.title}
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify tsc clean + commit**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "ChannelGridPanel" | head -5
# expected: empty

git add src/renderer/features/control/ChannelGridPanel.tsx
git commit -m "feat(control): add ChannelGridPanel live tiles

Auto-fill grid (minmax 200px), each tile: 16:9 thumb + animated
viewer-count Pill + game label + channel name + stream title. The
'watching' tile gets an accent border + accent-soft bg + 'watching'
pill on the thumb. Exiting tiles fade to 30% opacity. Skeleton on
first load. Empty state when no target game selected or no live
channels. Refresh button in header with spinning icon while pending."
```

---

## Task 5: Create `CampaignsPanel.tsx`

Campaign tabs + per-drop list. Lightweight version — keeps the legacy campaign-grouping logic in useControlViewState but renders with new tokens.

**Files:**
- Create: `src/renderer/features/control/CampaignsPanel.tsx`

- [ ] **Step 1: Create the file**

```tsx
import * as React from "react";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { Pill } from "@renderer/shared/components/ui/pill";
import { cn } from "@renderer/shared/lib/utils";
import { useI18n } from "@renderer/shared/i18n";
import {
  formatBlockingReason,
  pickDisplayBlockingReason,
} from "./controlHelpers";
import { formatHourMinute, formatPercent } from "@renderer/features/overview/formatters";

export type CampaignGroupDrop = {
  id: string;
  title: string;
  requiredMinutes: number;
  earnedMinutes: number;
  status: "locked" | "progress" | "claimed";
  blocked?: boolean;
  blockingReasonHints?: string[];
};

export type CampaignGroup = {
  id: string;
  name: string;
  drops: CampaignGroupDrop[];
  totalRequired: number;
  totalEarned: number;
  hasActiveDrop: boolean;
};

export type CampaignsPanelProps = {
  groups: CampaignGroup[];
  selectedCampaignId: string | null;
  onSelectCampaign: (id: string) => void;
};

export function CampaignsPanel({
  groups,
  selectedCampaignId,
  onSelectCampaign,
}: CampaignsPanelProps) {
  const { t } = useI18n();

  if (groups.length === 0) {
    return (
      <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-5 py-8 text-center">
        <p className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
          no active campaigns
        </p>
      </div>
    );
  }

  const activeGroup = groups.find((g) => g.id === selectedCampaignId) ?? groups[0];

  return (
    <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)]">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[color:var(--dp-border-soft)]">
        <SectionLabel inline>campaigns</SectionLabel>
        <span className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
          · {groups.length}
        </span>
      </div>

      {/* Campaign tabs */}
      <div className="px-5 py-3 border-b border-[color:var(--dp-border-soft)] flex flex-wrap gap-1.5">
        {groups.map((g) => {
          const isActive = g.id === activeGroup.id;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => onSelectCampaign(g.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[var(--dp-radius-sm)] border px-2.5 py-1",
                "font-mono text-[11px] tracking-[0.02em] transition-colors",
                isActive
                  ? "border-[color:var(--dp-accent-soft)] bg-[color:var(--dp-accent-soft)] text-[color:var(--dp-accent)]"
                  : "border-[color:var(--dp-border)] bg-transparent text-[color:var(--dp-text-dim)] hover:bg-[color:var(--dp-bg-elevated-2)] hover:text-[color:var(--dp-text)]",
              )}
            >
              {g.hasActiveDrop && (
                <span
                  aria-hidden="true"
                  className="inline-block h-[5px] w-[5px] rounded-full bg-[color:var(--dp-accent)] flex-shrink-0"
                  style={{ boxShadow: "0 0 6px var(--dp-accent-glow)" }}
                />
              )}
              <span className="truncate max-w-[200px]">{g.name}</span>
            </button>
          );
        })}
      </div>

      {/* Drops list */}
      <ul className="list-none p-0 m-0">
        {activeGroup.drops.map((drop) => {
          const pct =
            drop.requiredMinutes > 0
              ? Math.round((drop.earnedMinutes / drop.requiredMinutes) * 100)
              : 0;
          const isClaimed = drop.status === "claimed";
          const blockingReason = drop.blocked
            ? pickDisplayBlockingReason(drop.blockingReasonHints ?? [])
            : undefined;
          const blockingLabel = blockingReason ? formatBlockingReason(blockingReason, t) : null;
          const tone: "ok" | "accent" | "warn" | "dim" = isClaimed
            ? "ok"
            : drop.status === "progress"
              ? drop.blocked
                ? "warn"
                : "accent"
              : "dim";
          const statusText = isClaimed
            ? "claimed"
            : drop.status === "progress"
              ? drop.blocked
                ? "blocked"
                : "live"
              : "queued";

          return (
            <li
              key={drop.id}
              className="grid items-center gap-3 px-5 h-[52px] border-b border-[color:var(--dp-border-soft)] last:border-b-0"
              style={{ gridTemplateColumns: "1fr 160px 100px" }}
            >
              <div className="min-w-0">
                <div className="truncate text-[13px] text-[color:var(--dp-text)]">
                  {drop.title}
                </div>
                {blockingLabel && (
                  <div className="font-mono text-[10px] text-[color:var(--dp-signal-warn)] truncate mt-0.5">
                    {blockingLabel}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-[3px] rounded-[2px] bg-[color:var(--dp-border)] overflow-hidden">
                  <div
                    className="h-full"
                    style={{
                      width: `${pct}%`,
                      background: isClaimed
                        ? "var(--dp-signal-ok)"
                        : drop.status === "progress"
                          ? "var(--dp-accent)"
                          : "var(--dp-text-dimmer)",
                    }}
                  />
                </div>
                <span className="font-mono text-[11px] text-[color:var(--dp-text-dim)] tabular-nums w-[34px] text-right">
                  {formatPercent(pct)}
                </span>
              </div>
              <Pill tone={tone} dot={drop.status === "progress" && !drop.blocked}>
                {statusText}
              </Pill>
            </li>
          );
        })}
      </ul>

      <div className="px-5 py-3 border-t border-[color:var(--dp-border-soft)] flex items-center justify-between font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
        <span>
          {formatHourMinute(activeGroup.totalEarned)} / {formatHourMinute(activeGroup.totalRequired)} total
        </span>
        <span>{activeGroup.drops.length} drop{activeGroup.drops.length === 1 ? "" : "s"}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify tsc clean + commit**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "CampaignsPanel" | head -5
# expected: empty

git add src/renderer/features/control/CampaignsPanel.tsx
git commit -m "feat(control): add CampaignsPanel with tabs + drop list

Replaces the legacy campaign selector + drop list inside Control.
Header + count, pill-chip campaign tabs (accent when active, with
violet dot if the campaign has an active drop), per-drop row with
title + blocking-reason warning + progress bar + percent + status
pill. Footer shows total earned/required minutes for the selected
campaign."
```

---

## Task 6: Rewrite `ControlView.tsx`

Compose the 4 new sub-panels. 1288 → ~280 lines. Existing `useControlViewState` hook unchanged.

**Files:**
- Modify: `src/renderer/features/control/ControlView.tsx` (full rewrite)

- [ ] **Step 1: Replace the file contents**

```tsx
import * as React from "react";
import type {
  AutoSwitchInfo,
  ChannelDiff,
  ChannelEntry,
  ChannelTrackerStatus,
  ClaimStatus,
  ErrorInfo,
  InventoryItem,
  WatchingState,
} from "@renderer/shared/types";
import { Button } from "@renderer/shared/components/ui/button";
import { Pill } from "@renderer/shared/components/ui/pill";
import { resolveErrorMessage } from "@renderer/shared/utils/errors";
import { useI18n } from "@renderer/shared/i18n";
import { Play, Square, RotateCw } from "@renderer/shared/lib/icons";
import { useControlViewState } from "./useControlViewState";
import { EngineStatusPanel } from "./EngineStatusPanel";
import { ActiveSessionPanel } from "./ActiveSessionPanel";
import { ChannelGridPanel } from "./ChannelGridPanel";
import { CampaignsPanel, type CampaignGroup } from "./CampaignsPanel";
import type {
  WatchEngineDecision,
  WatchEngineSuppressionReason,
} from "./controlHelpers";

type WatchEngineSnapshot = {
  decision: WatchEngineDecision;
  targetGame: string;
  activeTargetGame: string;
  suppression: {
    game: string;
    reason: WatchEngineSuppressionReason;
    sinceAt: number | null;
    holdRemainingMs: number;
  } | null;
  activeCooldowns: Array<{ game: string; until: number; remainingMs: number }>;
  allowlistActive: boolean;
  allowlistedLiveChannels: number;
  totalLiveChannels: number;
  noProgressTracker: { recoveryCount: number; sinceProgressMs: number } | null;
};

type ControlProps = {
  targetGame: string;
  targetDrops: InventoryItem[];
  targetProgress: number;
  totalDrops: number;
  claimedDrops: number;
  inventoryRefreshing: boolean;
  inventoryFetchedAt: number | null;
  fetchInventory: () => void;
  refreshPriorityPlan: () => void;
  watching: WatchingState;
  lastWatchedChannelIdentity: { id: string; login: string } | null;
  stopWatching: () => void;
  channels: ChannelEntry[];
  channelsLoading: boolean;
  channelsRefreshing: boolean;
  channelDiff: ChannelDiff | null;
  channelError: ErrorInfo | null;
  startWatching: (ch: ChannelEntry) => void;
  activeDropInfo: {
    id: string;
    title: string;
    requiredMinutes: number;
    earnedMinutes: number;
    virtualEarned: number;
    remainingMinutes: number;
    eta: number | null;
    progressAnchorAt?: number;
    dropInstanceId?: string;
    campaignId?: string;
  } | null;
  claimStatus: ClaimStatus | null;
  canWatchTarget: boolean;
  showNoDropsHint: boolean;
  lastWatchOk?: number;
  watchError?: ErrorInfo | null;
  autoSwitchInfo?: AutoSwitchInfo | null;
  trackerStatus?: ChannelTrackerStatus | null;
  watchEngineSnapshot: WatchEngineSnapshot;
};

export function ControlView(props: ControlProps) {
  const { t } = useI18n();
  const {
    targetGame,
    targetDrops,
    inventoryRefreshing,
    inventoryFetchedAt,
    fetchInventory,
    watching,
    lastWatchedChannelIdentity,
    stopWatching,
    channels,
    channelsLoading,
    channelsRefreshing,
    channelDiff,
    channelError,
    startWatching,
    activeDropInfo,
    claimStatus,
    lastWatchOk,
    watchError,
    trackerStatus,
    watchEngineSnapshot,
  } = props;

  const state = useControlViewState({
    channels,
    channelDiff,
    channelsLoading,
    channelsRefreshing,
    targetGame,
    watching,
    lastWatchedChannelIdentity,
    targetDrops,
    activeDropInfo,
    inventoryFetchedAt,
    trackerStatus,
    t,
  });

  const watchErrorText = watchError ? resolveErrorMessage(t, watchError) : null;
  const claimErrorText =
    claimStatus?.kind === "error"
      ? resolveErrorMessage(t, { code: claimStatus.code, message: claimStatus.message })
      : null;
  const claimSuccessText =
    claimStatus?.kind === "success" ? (claimStatus.message ?? null) : null;

  const isWatching = !!watching;
  const handleToggleWatch = React.useCallback(() => {
    if (isWatching) {
      stopWatching();
    } else if (state.resumeChannel) {
      startWatching(state.resumeChannel);
    }
  }, [isWatching, state.resumeChannel, startWatching, stopWatching]);
  const toggleLabel = isWatching ? t("control.stop") : state.resumeChannel ? t("control.resume") : null;

  // Adapt useControlViewState's campaignGroups to CampaignsPanel shape
  const campaignGroups: CampaignGroup[] = React.useMemo(() => {
    return state.campaignGroups.map((group) => ({
      id: group.id,
      name: group.name,
      hasActiveDrop: group.drops.some((d) => activeDropInfo?.id === d.id),
      totalRequired: group.drops.reduce(
        (sum, d) => sum + Math.max(0, Number(d.requiredMinutes) || 0),
        0,
      ),
      totalEarned: group.drops.reduce(
        (sum, d) => sum + Math.max(0, Number(d.earnedMinutes) || 0),
        0,
      ),
      drops: group.drops.map((d) => ({
        id: d.id,
        title: d.title,
        requiredMinutes: d.requiredMinutes,
        earnedMinutes: d.earnedMinutes,
        status: d.status ?? "locked",
        blocked: d.blocked,
        blockingReasonHints: d.blockingReasonHints,
      })),
    }));
  }, [state.campaignGroups, activeDropInfo]);

  const [selectedCampaignId, setSelectedCampaignId] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (selectedCampaignId && campaignGroups.some((g) => g.id === selectedCampaignId)) return;
    const activeGroup = campaignGroups.find((g) => g.hasActiveDrop);
    setSelectedCampaignId(activeGroup?.id ?? campaignGroups[0]?.id ?? null);
  }, [campaignGroups, selectedCampaignId]);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[22px] font-medium tracking-[-0.01em] text-[color:var(--dp-text)] leading-tight">
            Control
          </h2>
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--dp-text-dimmer)] mt-1">
            watch engine · channels · campaigns
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {claimSuccessText && (
            <Pill tone="ok" dot>
              {claimSuccessText}
            </Pill>
          )}
          {claimErrorText && (
            <Pill tone="err" dot title={claimErrorText}>
              claim error
            </Pill>
          )}
          {watchErrorText && (
            <Pill tone="err" dot title={watchErrorText}>
              watch error
            </Pill>
          )}
          {toggleLabel && (
            <Button
              variant={isWatching ? "dp-secondary" : "dp-primary"}
              size="dp-md"
              onClick={handleToggleWatch}
            >
              {isWatching ? (
                <Square size={11} strokeWidth={1.8} />
              ) : (
                <Play size={11} strokeWidth={1.8} />
              )}
              {toggleLabel}
            </Button>
          )}
          <Button
            variant="dp-ghost"
            size="dp-md"
            onClick={fetchInventory}
            disabled={inventoryRefreshing}
          >
            <RotateCw
              size={11}
              strokeWidth={1.8}
              className={inventoryRefreshing ? "animate-spin" : undefined}
            />
            refresh
          </Button>
        </div>
      </div>

      {/* Engine status */}
      <EngineStatusPanel
        decision={watchEngineSnapshot.decision}
        targetGame={watchEngineSnapshot.targetGame}
        activeTargetGame={watchEngineSnapshot.activeTargetGame}
        suppression={watchEngineSnapshot.suppression}
        activeCooldowns={watchEngineSnapshot.activeCooldowns}
        allowlistActive={watchEngineSnapshot.allowlistActive}
        allowlistedLiveChannels={watchEngineSnapshot.allowlistedLiveChannels}
        totalLiveChannels={watchEngineSnapshot.totalLiveChannels}
        noProgressTracker={watchEngineSnapshot.noProgressTracker}
      />

      {/* Active session */}
      <ActiveSessionPanel
        watching={watching}
        activeChannel={state.activeChannel}
        activeThumb={state.activeThumb}
        activeLoginMismatch={state.activeLoginMismatch}
        activeDropTitle={activeDropInfo?.title ?? null}
        activeDropEarnedMinutes={activeDropInfo?.earnedMinutes ?? 0}
        activeDropRequiredMinutes={activeDropInfo?.requiredMinutes ?? 0}
        activeEtaText={state.activeEtaText}
        lastWatchOk={lastWatchOk}
      />

      {/* Campaigns */}
      <CampaignsPanel
        groups={campaignGroups}
        selectedCampaignId={selectedCampaignId}
        onSelectCampaign={setSelectedCampaignId}
      />

      {/* Live channels */}
      <ChannelGridPanel
        channels={state.combinedChannels}
        animatedViewersById={state.animatedViewersById}
        channelChangedIds={state.channelChangedIds}
        channelsLoading={channelsLoading}
        channelsRefreshing={channelsRefreshing}
        channelError={channelError}
        showChannelSkeleton={state.showChannelSkeleton}
        targetGame={targetGame}
        onStartWatching={startWatching}
        watchingChannelId={state.activeChannel?.id}
        onRefresh={fetchInventory}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify tests + tsc**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "ControlView" | head -5
# expected: empty (or only pre-existing errors, none new)

npm test 2>&1 | tail -5
# expected: 214/214 pass
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/features/control/ControlView.tsx
git commit -m "feat(control): rewrite ControlView as composition

Replaces the 1288-line monolith with: header (title + claim/watch
pills + toggle button + refresh) + EngineStatusPanel + ActiveSession
Panel + CampaignsPanel + ChannelGridPanel. useControlViewState hook
unchanged (still owns channel animations, live progress tracking,
campaign grouping, change detection).

The legacy .control-layout 2-column grid is replaced with a single
column flow — the new chrome already provides max-width and padding.

Adapts useControlViewState.campaignGroups into the CampaignsPanel
shape (adds hasActiveDrop derivation + totalEarned/totalRequired
aggregates). selectedCampaignId state lives in ControlView and
auto-resets to the active campaign when groups change."
```

---

## Task 7: Wire HeroPanel pause + switch target

Connect Overview's HeroPanel quick-action placeholders to real handlers. `claim now` stays disabled (needs claim-engine surfacing, out of scope).

**Files:**
- Modify: `src/renderer/features/overview/HeroPanel.tsx` — accept `onPause` + `onSwitchTarget` props, wire to buttons
- Modify: `src/renderer/features/overview/OverviewView.tsx` — accept the 2 callbacks, forward to HeroPanel
- Modify: `src/renderer/App.tsx` — pass `onPause` + `onSwitchTarget` into OverviewView via the inline render

- [ ] **Step 1: Update HeroPanel**

In `src/renderer/features/overview/HeroPanel.tsx`, add two new optional callbacks to `HeroPanelProps`:

```tsx
export type HeroPanelProps = {
  activeGame?: string;
  activeDropTitle?: string;
  activeDropEta?: number | null;
  activeDropRemainingMinutes?: number;
  targetProgress: number;
  claimableDrops: number;
  channelsCount: number;
  totalDrops: number;
  claimedDrops: number;
  isLive: boolean;
  /** Pause the watch engine (Phase 5 wiring). When null/undefined, pause button stays disabled. */
  onPause?: () => void;
  /** Navigate to Priorities (Phase 5 wiring). When null/undefined, switch button stays disabled. */
  onSwitchTarget?: () => void;
};
```

Add `onPause` and `onSwitchTarget` to the destructure. Find the Quick actions row (the `<div className="flex gap-2 mt-4">` block) and update the two relevant buttons:

```tsx
        <div className="flex gap-2 mt-4">
          <Button variant="dp-primary" size="dp-md" disabled={!hasClaimable} title="Use Inventory view to claim">
            <Check size={11} strokeWidth={2.2} /> claim now
          </Button>
          <Button
            variant="dp-secondary"
            size="dp-md"
            onClick={onPause}
            disabled={!onPause || !isLive}
            title={!onPause ? "Phase 5 will wire this" : !isLive ? "Engine is not running" : "Pause the watch engine"}
          >
            <Pause size={11} strokeWidth={1.8} /> pause
          </Button>
          <Button
            variant="dp-outline"
            size="dp-md"
            onClick={onSwitchTarget}
            disabled={!onSwitchTarget}
            title={onSwitchTarget ? "Open Priorities view to switch target" : "Phase 5 will wire this"}
          >
            <RotateCw size={11} strokeWidth={1.8} /> switch target
          </Button>
        </div>
```

(claim now is unchanged — still disabled.)

- [ ] **Step 2: Update OverviewView**

In `src/renderer/features/overview/OverviewView.tsx`, add the two new props to the prop type and forward to HeroPanel:

Find `type OverviewProps = { ... }` block. Add at the end (before the closing `}`):
```tsx
  onPause?: () => void;
  onSwitchTarget?: () => void;
```

Add `onPause` and `onSwitchTarget` to the destructure of the OverviewView function. Find the `<HeroPanel ... />` JSX and add the two new props:

```tsx
        <HeroPanel
          activeGame={activeGame}
          activeDropTitle={activeDropTitle}
          activeDropEta={activeDropEta}
          activeDropRemainingMinutes={activeDropRemainingMinutes}
          targetProgress={targetProgress}
          claimableDrops={claimableDrops}
          channelsCount={channelsCount}
          totalDrops={totalDrops}
          claimedDrops={claimedDrops}
          isLive={isLive}
          onPause={onPause}
          onSwitchTarget={onSwitchTarget}
        />
```

- [ ] **Step 3: Update App.tsx to pass callbacks**

In `src/renderer/App.tsx`, find where `OverviewView` is rendered inside `AppContent`. The current code passes `overviewProps={overviewProps}`. We need to pass through `controlProps.stopWatching` as `onPause` and a navigation function as `onSwitchTarget`.

Locate `<AppContent ... overviewProps={overviewProps} ... />`. Just before it, in the `AppShell` function body, add:

```tsx
  const overviewPropsExtended = React.useMemo(
    () => ({
      ...overviewProps,
      onPause: controlProps.stopWatching,
      onSwitchTarget: () => navProps.setView("priorities"),
    }),
    [overviewProps, controlProps.stopWatching, navProps],
  );
```

Then change the `AppContent` call to pass `overviewProps={overviewPropsExtended}` instead of `overviewPropsExtended`. Find the line:
```tsx
          overviewProps={overviewProps}
```
Replace with:
```tsx
          overviewProps={overviewPropsExtended}
```

Note: `navProps` is a fresh object literal each render. The `useMemo` dep on `navProps` (object) is OK because consumer side effects don't re-trigger; the slight identity churn is harmless.

- [ ] **Step 4: tsc + tests**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "(HeroPanel|OverviewView|App\.tsx)" | head -10
# expected: empty

npm test 2>&1 | tail -5
# expected: 214/214
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/overview/HeroPanel.tsx src/renderer/features/overview/OverviewView.tsx src/renderer/App.tsx
git commit -m "feat(overview): wire HeroPanel pause + switch target

Pause now calls controlProps.stopWatching (when isLive); button
stays disabled when engine isn't running. Switch target now
navigates to the Priorities view. Claim now still placeholder
(claim engine surfacing is a future phase).

App.tsx assembles overviewPropsExtended that spreads the existing
overviewProps and adds the two callbacks; useAppModel shape is
untouched (the wiring lives at the App.tsx layer)."
```

---

## Task 8: i18n the Statusbar engine label

Replace App.tsx's hardcoded `"engine: running"` / `"engine: paused"` / `"engine: idle"` / `"engine: standby"` strings with `t()` lookups. Add 4 new i18n keys in both English and German locale files.

**Files:**
- Modify: i18n locale files (locate them first — likely `src/renderer/shared/i18n/<locale>.ts` or `.json`)
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Locate i18n files**

Run: `find src/renderer/shared/i18n -type f -name "*.ts" -o -name "*.json" 2>&1 | head -10`

Read one of the locale files (e.g., `en.ts` or `index.ts`) to understand the shape — it's a nested object with translation strings. Find a similar section to add the new keys (e.g., next to `control.watchEngineDecision.*`).

- [ ] **Step 2: Add 4 new keys to each locale**

Add (English):
```ts
"statusbar.engine.running": "engine: running",
"statusbar.engine.paused": "engine: paused",
"statusbar.engine.idle": "engine: idle",
"statusbar.engine.standby": "engine: standby",
```

If the German locale exists:
```ts
"statusbar.engine.running": "engine: läuft",
"statusbar.engine.paused": "engine: pausiert",
"statusbar.engine.idle": "engine: leerlauf",
"statusbar.engine.standby": "engine: standby",
```

The flat-key vs nested-object style should match whatever the existing file uses.

- [ ] **Step 3: Update App.tsx engineLabel**

Find the `engineLabel` useMemo in App.tsx. Currently:
```tsx
  const engineLabel = React.useMemo(() => {
    const d = overviewProps.watchDecision;
    if (d === "watching-progress" || d === "watching-recover") return "engine: running";
    if (d === "watching-no-farmable" || d === "watching-no-watchable") return "engine: standby";
    if (d === "suppressed" || d === "cooldown") return "engine: paused";
    if (d === "no-target") return "engine: idle";
    if (d.startsWith("idle")) return "engine: idle";
    return "engine: idle";
  }, [overviewProps.watchDecision]);
```

Replace with:
```tsx
  const engineLabel = React.useMemo(() => {
    const d = overviewProps.watchDecision;
    if (d === "watching-progress" || d === "watching-recover") return t("statusbar.engine.running");
    if (d === "watching-no-farmable" || d === "watching-no-watchable") return t("statusbar.engine.standby");
    if (d === "suppressed" || d === "cooldown") return t("statusbar.engine.paused");
    if (d === "no-target") return t("statusbar.engine.idle");
    if (d.startsWith("idle")) return t("statusbar.engine.idle");
    return t("statusbar.engine.idle");
  }, [overviewProps.watchDecision, t]);
```

Add `t` to the dep array.

- [ ] **Step 4: tsc + tests**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "App\.tsx" | head -5
# expected: empty

npm test 2>&1 | tail -5
# expected: 214/214
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/shared/i18n/ src/renderer/App.tsx
git commit -m "feat(i18n): localize Statusbar engine label

App.tsx no longer carries hardcoded 'engine: running/paused/idle/
standby' strings. Adds 4 new keys (statusbar.engine.*) to each
locale file and routes the Statusbar engine label through t().
Resolves the Phase 2 follow-up about Statusbar i18n."
```

---

## Task 9: Verify end-to-end

- [ ] **Step 1: Lint**

`npm run lint` — exit 0. New warnings must be fixed.

- [ ] **Step 2: TypeScript**

`npx tsc --noEmit -p tsconfig.json` — Phase 4 baseline is 19 pre-existing errors. Compare. Any new errors must be fixed.

**Expected improvement:** ControlView's pre-existing line-475 error (which was the legacy `<button onClick={onOpenAccountLink}>` type mismatch) and the watchEngineSnapshot type errors should be GONE after rewrite. Pre-existing error count may drop from ~19 to ~10-15.

- [ ] **Step 3: Tests**

`npm test 2>&1 | tail -10` — 214/214 pass.

- [ ] **Step 4: Format**

`npm run format` — commit if anything reformatted:
```bash
git diff --quiet || (git add -A && git commit -m "chore: prettier format design-overhaul phase 5 files")
```

- [ ] **Step 5: Build**

`npm run build` — exit 0.

- [ ] **Step 6: Branch summary**

`git log --oneline feat/design-overhaul-phase-4-priorities-control..HEAD`

Expected commits (in order):
- docs(plan): phase 5 control plan
- feat(control): extract controlHelpers module
- feat(control): add EngineStatusPanel collapsible status
- feat(control): add ActiveSessionPanel for watching state
- feat(control): add ChannelGridPanel live tiles
- feat(control): add CampaignsPanel with tabs + drop list
- feat(control): rewrite ControlView as composition
- feat(overview): wire HeroPanel pause + switch target
- feat(i18n): localize Statusbar engine label
- (chore: prettier format if any)

## Report

- Status: DONE | DONE_WITH_CONCERNS | BLOCKED
- Lint result
- TSC error count (compare to 19 baseline — expected to drop)
- Tests
- Format
- Build
- Branch log
- Concerns

Do NOT `npm run dev`.

---

## Out of Scope

- Manual Override panel (game-selector + channel input + apply) — not present in current Control, would be new feature
- Event Log panel — not present in current Control, would be new feature  
- Claim-now wiring in HeroPanel — needs claim-engine surfacing through useAppModel, bigger than Phase 5
- EnginePanel (Overview side card) `watch_cycle`/`cadence` real values — requires plumbing real settings through useAppModel, deferred to Phase 6 (Settings phase)
- Settings view migration — Phase 6
- Debug view migration — Phase 7
- Material Symbols `<link>` removal — Phase 7 final cleanup
- Legacy CSS class deletion (`.control-*`, `.priority-*`, etc.) — Phase 7

## Open items for follow-up

- The legacy `useControlViewState` hook still uses `Translator` indirectly via the `t` parameter; it works fine but could be refactored to receive pre-translated strings via the consumer if the hook becomes useful elsewhere.
- `CampaignsPanel` doesn't support keyboard navigation between tabs — add arrow-key handling in a polish PR.
- `ChannelGridPanel` skeleton tile doesn't show `aria-busy` — minor a11y.
- `EngineStatusPanel` expanded-state isn't persisted across remounts; users have to re-expand. localStorage in a future polish if requested.

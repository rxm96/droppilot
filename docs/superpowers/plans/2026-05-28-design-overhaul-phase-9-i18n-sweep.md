# Design Overhaul — Phase 9: Phase 2-5 i18n Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Sweep every remaining hardcoded English literal out of the Phase 2-5 components into the i18n system. Phase 8 covered Settings; Phase 9 covers everything else built during the overhaul. After this lands, no shipped UI text outside generic shadcn primitives is English-only.

**Architecture:** Mechanical wire-up. Add new namespaces (`queue.*`, `activity.*`, `engine.*`, `attention.*`) and a handful of additions to existing namespaces (`hero.*`, `overview.*`, `inventory.*`, `control.*`, `priorities.*`). Then wire `useI18n()` into each affected component, replacing literals with `t(...)` calls.

**Tech Stack:** No new dependencies. Existing i18n is `src/renderer/shared/i18n.tsx`.

**Spec reference:** [`../specs/2026-05-27-design-overhaul-design.md`](../specs/2026-05-27-design-overhaul-design.md) §11.

**Branch:** `feat/design-overhaul-phase-9-i18n-sweep` (stacked on `feat/design-overhaul-phase-8-i18n-wirings`)

**PR target:** `feat/design-overhaul-phase-8-i18n-wirings` — GitHub auto-retargets.

### Locked decisions

1. **Reuse existing keys aggressively.** Pre-flight audit identified rich existing vocabularies in `overview.*` (35 keys), `inventory.*` (47), `control.*` (90), `priorities.*` (20+). Reuse where the string fits semantically.
2. **Add 4 new namespaces:** `queue.*`, `activity.*`, `engine.*`, `attention.*`.
3. **Claim engine wiring is OUT of scope** — the audit confirmed no manual-claim API surface exists. Wiring it requires changes to `useInventory`, `useAppModel`, and the hook→component data flow. Deferred to Phase 10.
4. **`formatters.ts` time fragments** stay hardcoded in English (e.g. "5m ago"). They're machine-style strings and translating them piecemeal (`{n}{unit} {connector}`) introduces ICU plurals overhead that's not worth it for v1. Add a TODO comment instead.
5. **Pill values like `live`/`queued`/`paused`/`claimed`** are mono-uppercase status tokens. Treat them as terminology and add proper keys.

### Pre-flight inventory

| File | Strings | Reuse target |
| --- | --- | --- |
| `HeroPanel.tsx` | ~12 | new `hero.now*`, `hero.button*` + reuse `overview.claimsReady`, `overview.openDrops` |
| `QueuePanel.tsx` | ~7 | new `queue.*` namespace |
| `ActivityPanel.tsx` | ~3 | new `activity.*` namespace |
| `EnginePanel.tsx` | ~5 | new `engine.*` namespace |
| `AttentionStrip.tsx` | ~5 | new `attention.*` namespace |
| `InventoryFilterStrip.tsx` | ~7 | reuse `inventory.filter.*` if exists, else add `inventory.filter.*` keys |
| `InventoryHeader.tsx` | ~8 | mostly reuse from existing 47 `inventory.*` |
| `InventoryTable.tsx` | ~5 column labels | reuse `queue.table.*` (queue and inventory tables share column semantics) |
| `InventoryDrawer.tsx` | ~9 | new `inventory.drawer.*` namespace |
| `EngineStatusPanel.tsx` | ~5 remaining | new `control.engineStatus.*` keys for `engine status`, `why`, `next`, and DetailRow labels |
| `ActiveSessionPanel.tsx` | ~8 | new `control.activeSession.*` |
| `ChannelGridPanel.tsx` | ~4 | new `control.channelGrid.*` |
| `CampaignsPanel.tsx` | ~5 | new `control.campaignsPanel.*` |
| `PriorityRow.tsx` | ~4 | reuse `priorities.state.*` |
| `PriorityList.tsx`, `PriorityHeader.tsx`, `PriorityAddPanel.tsx` | TBD | scan + i18n in T05 |

---

## File Structure

**Modified files (1 + 15-ish components):**
- `src/renderer/shared/i18n.tsx` — add ~70-80 new keys (EN+DE)
- `src/renderer/features/overview/{HeroPanel,QueuePanel,ActivityPanel,EnginePanel,AttentionStrip}.tsx`
- `src/renderer/features/inventory/{InventoryFilterStrip,InventoryHeader,InventoryTable,InventoryDrawer}.tsx`
- `src/renderer/features/control/{EngineStatusPanel,ActiveSessionPanel,ChannelGridPanel,CampaignsPanel}.tsx`
- `src/renderer/features/priority/{PriorityRow,PriorityList,PriorityHeader,PriorityAddPanel}.tsx` (scope discovered in T05)

**Untouched:**
- Settings (Phase 8 already)
- Phase 1 primitives (no UI text of their own that needs i18n; consumer-supplied labels)
- Hooks / non-component code
- formatters.ts time fragments (locked out, see decision 4)

---

## Task 1: Add new i18n keys to i18n.tsx (EN + DE)

**File:** `src/renderer/shared/i18n.tsx`

Add the following to BOTH `en:` and `de:` blocks. Insert near existing namespaces alphabetically where possible.

### EN additions (~75 keys)

```ts
// hero.now* and hero.button* — HeroPanel
"hero.nowWatching": "currently watching",
"hero.statusLive": "LIVE · earning drop",
"hero.statusIdle": "IDLE",
"hero.noActiveTarget": "No active target",
"hero.stat.eta": "eta",
"hero.stat.channels": "channels",
"hero.stat.claimsReady": "claims ready",
"hero.stat.openDrops": "open drops",
"hero.stat.useInventory": "use inventory",
"hero.stat.percentComplete": "{pct}% complete",
"hero.button.claimNow": "claim now",
"hero.button.pause": "pause",
"hero.button.switchTarget": "switch target",
"hero.title.useInventoryToClaim": "Use Inventory view to claim",
"hero.title.engineNotRunning": "Engine is not running",
"hero.title.pauseEngine": "Pause the watch engine",
"hero.title.openPrioritiesToSwitch": "Open Priorities view to switch target",
"hero.title.wireLater": "Wiring coming in a follow-up phase",

// queue.* — QueuePanel
"queue.header": "queue · next up",
"queue.manage": "manage →",
"queue.empty": "no drops in queue",
"queue.table.dropGame": "drop · game",
"queue.table.watched": "watched",
"queue.table.progress": "progress",
"queue.table.status": "status",
"queue.pill.live": "live",
"queue.pill.queued": "queued",

// activity.* — ActivityPanel
"activity.header": "recent activity",
"activity.empty": "no claims yet",
"activity.claimedPrefix": "Claimed",
"activity.recently": "recently",

// engine.* — EnginePanel (Overview)
"engine.header": "engine",
"engine.row.watchCycle": "watch_cycle",
"engine.row.lastRefresh": "last_refresh",
"engine.row.cadence": "cadence",
"engine.row.uptime": "uptime",

// attention.* — AttentionStrip
"attention.claimReady": "{count} claim ready",
"attention.claimsReady": "{count} claims ready",
"attention.watchError": "watch error",
"attention.noChannels": "no channels",
"attention.trackerLabel": "tracker {state}",

// inventory.filter.* — InventoryFilterStrip (and InventoryHeader bits)
"inventory.filter.aria": "Inventory filter",
"inventory.filter.all": "all",
"inventory.filter.priority": "priority",
"inventory.filter.live": "live",
"inventory.filter.upcoming": "upcoming",
"inventory.filter.claimed": "claimed",
"inventory.filter.notLinked": "not linked",
"inventory.filter.expired": "expired",

// inventory.header.* — InventoryHeader
"inventory.header.title": "Inventory",
"inventory.header.searchPlaceholder": "search drops…",
"inventory.header.allGames": "All games",
"inventory.header.refreshTitle": "Refresh inventory",
"inventory.header.refreshing": "refreshing",
"inventory.header.refresh": "refresh",
"inventory.header.linkAccount": "link account",
"inventory.header.dropsNeedLink.one": "{count} drop needs account-link",
"inventory.header.dropsNeedLink.other": "{count} drops need account-link",
"inventory.header.countOf.one": "{shown} of {total} drop",
"inventory.header.countOf.other": "{shown} of {total} drops",

// inventory.drawer.* — InventoryDrawer
"inventory.drawer.title": "drop details",
"inventory.drawer.close": "Close",
"inventory.drawer.closeAria": "Close drawer",
"inventory.drawer.progress": "progress",
"inventory.drawer.blocked": "blocked",
"inventory.drawer.campaign": "campaign",
"inventory.drawer.starts": "starts",
"inventory.drawer.ends": "ends",
"inventory.drawer.watchedRequired": "watched · required",
"inventory.drawer.addToPriorities": "add {game} to priorities",
"inventory.drawer.noActions": "no actions available",

// control.engineStatus.* — EngineStatusPanel hardcoded remnants
"control.engineStatus.header": "engine status",
"control.engineStatus.why": "why",
"control.engineStatus.next": "next",
"control.engineStatus.detail.target": "target",
"control.engineStatus.detail.suppression": "suppression",
"control.engineStatus.detail.cooldowns": "cooldowns",
"control.engineStatus.detail.allowlist": "allowlist",
"control.engineStatus.detail.noProgress": "no-progress",

// control.activeSession.* — ActiveSessionPanel
"control.activeSession.nowWatching": "now watching",
"control.activeSession.noActiveSession": "no active session",
"control.activeSession.lastPing": "last ping",
"control.activeSession.loading": "loading…",
"control.activeSession.noStream": "no stream",
"control.activeSession.live": "live",
"control.activeSession.paused": "paused",
"control.activeSession.activeDrop": "active drop",
"control.activeSession.watchedRequiredEta": "{watched} watched · {required} required · eta {eta}",
"control.activeSession.watchedRequired": "{watched} watched · {required} required",
"control.activeSession.noFarmable": "no farmable drop on this channel",
"control.activeSession.engineIdle": "engine idle",
"control.activeSession.viewers": "viewers",

// control.channelGrid.* — ChannelGridPanel
"control.channelGrid.header": "live channels",
"control.channelGrid.refreshTitle": "Refresh channel list",
"control.channelGrid.refresh": "refresh",
"control.channelGrid.noTarget": "select a target game in Priorities to see live channels",
"control.channelGrid.watchingPill": "watching",

// control.campaignsPanel.* — CampaignsPanel
"control.campaignsPanel.empty": "no active campaigns",
"control.campaignsPanel.header": "campaigns",
"control.campaignsPanel.status.claimed": "claimed",
"control.campaignsPanel.status.blocked": "blocked",
"control.campaignsPanel.status.live": "live",
"control.campaignsPanel.status.queued": "queued",
"control.campaignsPanel.footerTotal": "total",
"control.campaignsPanel.footerDrops.one": "{count} drop",
"control.campaignsPanel.footerDrops.other": "{count} drops",

// priority row reuses existing priorities.state.* — no new keys needed there
// However add aria labels:
"priorities.row.dragAria": "Drag {game}",
"priorities.row.removeAria": "Remove {game}",
```

### DE additions (matching ~75 keys)

```ts
"hero.nowWatching": "läuft gerade",
"hero.statusLive": "LIVE · sammelt Drop",
"hero.statusIdle": "PAUSE",
"hero.noActiveTarget": "Kein aktives Ziel",
"hero.stat.eta": "eta",
"hero.stat.channels": "channels",
"hero.stat.claimsReady": "claims bereit",
"hero.stat.openDrops": "offene drops",
"hero.stat.useInventory": "inventar nutzen",
"hero.stat.percentComplete": "{pct}% fertig",
"hero.button.claimNow": "jetzt claimen",
"hero.button.pause": "pause",
"hero.button.switchTarget": "ziel wechseln",
"hero.title.useInventoryToClaim": "Im Inventar claimen",
"hero.title.engineNotRunning": "Engine läuft nicht",
"hero.title.pauseEngine": "Watch-Engine pausieren",
"hero.title.openPrioritiesToSwitch": "Prioritäten-Ansicht öffnen, um Ziel zu wechseln",
"hero.title.wireLater": "Wird in einer späteren Phase verkabelt",

"queue.header": "queue · als nächstes",
"queue.manage": "verwalten →",
"queue.empty": "keine drops in der queue",
"queue.table.dropGame": "drop · spiel",
"queue.table.watched": "geschaut",
"queue.table.progress": "fortschritt",
"queue.table.status": "status",
"queue.pill.live": "live",
"queue.pill.queued": "queue",

"activity.header": "letzte aktivität",
"activity.empty": "noch keine claims",
"activity.claimedPrefix": "Eingesammelt:",
"activity.recently": "vor kurzem",

"engine.header": "engine",
"engine.row.watchCycle": "watch_cycle",
"engine.row.lastRefresh": "last_refresh",
"engine.row.cadence": "cadence",
"engine.row.uptime": "uptime",

"attention.claimReady": "{count} claim bereit",
"attention.claimsReady": "{count} claims bereit",
"attention.watchError": "watch-fehler",
"attention.noChannels": "keine channels",
"attention.trackerLabel": "tracker {state}",

"inventory.filter.aria": "Inventar-Filter",
"inventory.filter.all": "alle",
"inventory.filter.priority": "priorität",
"inventory.filter.live": "live",
"inventory.filter.upcoming": "kommend",
"inventory.filter.claimed": "geclaimt",
"inventory.filter.notLinked": "nicht verknüpft",
"inventory.filter.expired": "abgelaufen",

"inventory.header.title": "Inventar",
"inventory.header.searchPlaceholder": "drops suchen…",
"inventory.header.allGames": "Alle Spiele",
"inventory.header.refreshTitle": "Inventar aktualisieren",
"inventory.header.refreshing": "lade",
"inventory.header.refresh": "aktualisieren",
"inventory.header.linkAccount": "account verknüpfen",
"inventory.header.dropsNeedLink.one": "{count} drop braucht Account-Link",
"inventory.header.dropsNeedLink.other": "{count} drops brauchen Account-Link",
"inventory.header.countOf.one": "{shown} von {total} drop",
"inventory.header.countOf.other": "{shown} von {total} drops",

"inventory.drawer.title": "drop-details",
"inventory.drawer.close": "Schließen",
"inventory.drawer.closeAria": "Drawer schließen",
"inventory.drawer.progress": "fortschritt",
"inventory.drawer.blocked": "blockiert",
"inventory.drawer.campaign": "kampagne",
"inventory.drawer.starts": "start",
"inventory.drawer.ends": "ende",
"inventory.drawer.watchedRequired": "geschaut · benötigt",
"inventory.drawer.addToPriorities": "{game} zu Prioritäten",
"inventory.drawer.noActions": "keine Aktionen verfügbar",

"control.engineStatus.header": "engine-status",
"control.engineStatus.why": "warum",
"control.engineStatus.next": "nächstes",
"control.engineStatus.detail.target": "ziel",
"control.engineStatus.detail.suppression": "unterdrückt",
"control.engineStatus.detail.cooldowns": "cooldowns",
"control.engineStatus.detail.allowlist": "allowlist",
"control.engineStatus.detail.noProgress": "kein fortschritt",

"control.activeSession.nowWatching": "läuft gerade",
"control.activeSession.noActiveSession": "keine aktive session",
"control.activeSession.lastPing": "letzter ping",
"control.activeSession.loading": "lade…",
"control.activeSession.noStream": "kein stream",
"control.activeSession.live": "live",
"control.activeSession.paused": "pausiert",
"control.activeSession.activeDrop": "aktiver drop",
"control.activeSession.watchedRequiredEta": "{watched} geschaut · {required} benötigt · eta {eta}",
"control.activeSession.watchedRequired": "{watched} geschaut · {required} benötigt",
"control.activeSession.noFarmable": "kein farmbarer drop auf diesem channel",
"control.activeSession.engineIdle": "engine im leerlauf",
"control.activeSession.viewers": "viewer",

"control.channelGrid.header": "live channels",
"control.channelGrid.refreshTitle": "Channel-Liste aktualisieren",
"control.channelGrid.refresh": "aktualisieren",
"control.channelGrid.noTarget": "wähle ein Ziel-Spiel in Prioritäten, um live channels zu sehen",
"control.channelGrid.watchingPill": "watching",

"control.campaignsPanel.empty": "keine aktiven Kampagnen",
"control.campaignsPanel.header": "kampagnen",
"control.campaignsPanel.status.claimed": "geclaimt",
"control.campaignsPanel.status.blocked": "blockiert",
"control.campaignsPanel.status.live": "live",
"control.campaignsPanel.status.queued": "queue",
"control.campaignsPanel.footerTotal": "gesamt",
"control.campaignsPanel.footerDrops.one": "{count} drop",
"control.campaignsPanel.footerDrops.other": "{count} drops",

"priorities.row.dragAria": "{game} ziehen",
"priorities.row.removeAria": "{game} entfernen",
```

### Steps

- [ ] **Step 1:** Add all EN keys to the `en:` block at a sensible insertion point (alphabetically grouped or at the end of `settings.*` block ~line 700 where Phase 8 added its keys).
- [ ] **Step 2:** Add all matching DE keys to the `de:` block at the same relative position.
- [ ] **Step 3:** Verify counts: `grep -c '"queue\.' src/renderer/shared/i18n.tsx` → 18 (9 × 2); `grep -c '"activity\.' src/renderer/shared/i18n.tsx` → 8; `grep -c '"attention\.' src/renderer/shared/i18n.tsx` → 10; `grep -c '"engine\.' src/renderer/shared/i18n.tsx` → 10.
- [ ] **Step 4:** TSC + tests.
- [ ] **Step 5:** Commit:
  ```
  feat(i18n): add ~75 keys for Phase 2-5 components (EN + DE)

  Adds queue.*, activity.*, engine.*, attention.* (4 new namespaces),
  hero.now*/hero.button*/hero.stat*/hero.title* additions, inventory.filter.*,
  inventory.header.*, inventory.drawer.* additions, control.engineStatus.*,
  control.activeSession.*, control.channelGrid.*, control.campaignsPanel.*
  additions, and priorities.row.*Aria.

  Prep for Phase 9 T02-T05 i18n wire-up across all Phase 2-5 components.
  ```

---

## Task 2: Wire Overview features (HeroPanel + QueuePanel + ActivityPanel + EnginePanel + AttentionStrip)

For each file: add `useI18n` import, call `const { t } = useI18n();`, replace listed hardcoded strings with `t(...)` calls.

### HeroPanel.tsx mappings

| Hardcoded | Key |
| --- | --- |
| `"currently watching"` | `hero.nowWatching` |
| `"LIVE · earning drop"` | `hero.statusLive` |
| `"IDLE"` | `hero.statusIdle` |
| `"No active target"` (default for title) | `hero.noActiveTarget` |
| `"eta"` (stat label) | `hero.stat.eta` |
| `"channels"` | `hero.stat.channels` |
| `"claims ready"` | `hero.stat.claimsReady` |
| `"open drops"` | `hero.stat.openDrops` |
| `"use inventory"` sub | `hero.stat.useInventory` |
| `${progressPct}% complete` | use `t("hero.stat.percentComplete", { pct: progressPct })` |
| `"claim now"` | `hero.button.claimNow` |
| `"pause"` | `hero.button.pause` |
| `"switch target"` | `hero.button.switchTarget` |
| title `"Use Inventory view to claim"` | `hero.title.useInventoryToClaim` |
| title `"Engine is not running"` | `hero.title.engineNotRunning` |
| title `"Pause the watch engine"` | `hero.title.pauseEngine` |
| title `"Open Priorities view to switch target"` | `hero.title.openPrioritiesToSwitch` |
| title `"Phase 5 will wire this"` | `hero.title.wireLater` |

### QueuePanel.tsx mappings

| Hardcoded | Key |
| --- | --- |
| `"queue · next up"` | `queue.header` |
| `"manage →"` | `queue.manage` |
| `"no drops in queue"` | `queue.empty` |
| `"drop · game"` | `queue.table.dropGame` |
| `"watched"` | `queue.table.watched` |
| `"progress"` | `queue.table.progress` |
| `"status"` | `queue.table.status` |
| status `"live"` in pill | `queue.pill.live` |
| status `"queued"` in pill | `queue.pill.queued` |

### ActivityPanel.tsx mappings

| Hardcoded | Key |
| --- | --- |
| `"recent activity"` | `activity.header` |
| `"no claims yet"` | `activity.empty` |
| `"Claimed"` (JSX prefix) | `activity.claimedPrefix` |
| `"recently"` | `activity.recently` |

### EnginePanel.tsx mappings

| Hardcoded | Key |
| --- | --- |
| `"engine"` (SectionLabel) | `engine.header` |
| `"watch_cycle"` row key | `engine.row.watchCycle` |
| `"last_refresh"` row key | `engine.row.lastRefresh` |
| `"cadence"` row key | `engine.row.cadence` |
| `"uptime"` row key | `engine.row.uptime` |

### AttentionStrip.tsx mappings

| Hardcoded | Key |
| --- | --- |
| `{count} claim ready` / `{count} claims ready` | use `t("attention.claimReady"|"attention.claimsReady", { count })` with count==1 picking single |
| `"watch error"` | `attention.watchError` |
| `"no channels"` | `attention.noChannels` |
| `tracker {connectionState}` | `t("attention.trackerLabel", { state: connectionState })` |

### Steps

- [ ] Wire each of the 5 files (add useI18n, replace strings).
- [ ] TSC + tests + lint.
- [ ] Branch check + ONE commit per task batch:
  ```
  feat(overview): wire useI18n into HeroPanel/QueuePanel/ActivityPanel/EnginePanel/AttentionStrip

  Replaces ~32 hardcoded English literals with t() calls using
  hero.now*/button*/stat*/title*, queue.*, activity.*, engine.*,
  attention.* keys added in T01.
  ```

---

## Task 3: Wire Inventory features (InventoryFilterStrip + InventoryHeader + InventoryTable + InventoryDrawer)

### InventoryFilterStrip.tsx mappings

The 7 `CHIP_DEFS` labels map to `inventory.filter.all`, `inventory.filter.priority`, `inventory.filter.live`, `inventory.filter.upcoming`, `inventory.filter.claimed`, `inventory.filter.notLinked`, `inventory.filter.expired`. Move `CHIP_DEFS` inside the component body so it can use `t()` — or build the array via `useMemo([t])`. The `aria-label="Inventory filter"` → `t("inventory.filter.aria")`.

### InventoryHeader.tsx mappings

| Hardcoded | Key |
| --- | --- |
| `"Inventory"` | `inventory.header.title` |
| `"search drops…"` placeholder | `inventory.header.searchPlaceholder` |
| `"All games"` | `inventory.header.allGames` |
| `"Refresh inventory"` title | `inventory.header.refreshTitle` |
| `"refreshing"` | `inventory.header.refreshing` |
| `"refresh"` | `inventory.header.refresh` |
| `"link account"` | `inventory.header.linkAccount` |
| `{n} drop{s} need account-link` | use plural pair `inventory.header.dropsNeedLink.{one|other}` |
| `{shown} of {total} drops` | use plural pair `inventory.header.countOf.{one|other}` |

For plurals: pick `.one` when count === 1, else `.other`. Templates use `{count}` / `{shown}` / `{total}` placeholders.

### InventoryTable.tsx mappings

Column header strings (`"drop · game"`, `"watched"`, `"progress"`, `"status"`) reuse the `queue.table.*` keys (intentional sharing).

### InventoryDrawer.tsx mappings

| Hardcoded | Key |
| --- | --- |
| `"drop details"` (SectionLabel) | `inventory.drawer.title` |
| `"Close"` aria | `inventory.drawer.close` |
| `"Close drawer"` aria | `inventory.drawer.closeAria` |
| `"progress"` | `inventory.drawer.progress` |
| `"blocked"` | `inventory.drawer.blocked` |
| `"campaign"` | `inventory.drawer.campaign` |
| `"starts"` | `inventory.drawer.starts` |
| `"ends"` | `inventory.drawer.ends` |
| `"watched · required"` | `inventory.drawer.watchedRequired` |
| `add {game} to priorities` | `t("inventory.drawer.addToPriorities", { game })` |
| `"no actions available"` | `inventory.drawer.noActions` |

### Steps

- [ ] Wire each file. Commit:
  ```
  feat(inventory): wire useI18n into FilterStrip/Header/Table/Drawer

  Replaces ~30 hardcoded English literals (filter chip labels, header
  controls, drawer details) with t() calls using new inventory.filter.*,
  inventory.header.*, inventory.drawer.* keys plus shared queue.table.*
  for column headers.
  ```

---

## Task 4: Wire Control features (EngineStatusPanel + ActiveSessionPanel + ChannelGridPanel + CampaignsPanel)

### EngineStatusPanel.tsx mappings

EngineStatusPanel already imports `useI18n`. Remaining hardcoded strings:

| Hardcoded | Key |
| --- | --- |
| `"engine status"` (SectionLabel inline) | `control.engineStatus.header` |
| `"why"` row label | `control.engineStatus.why` |
| `"next"` row label | `control.engineStatus.next` |
| DetailRow label `"target"` | `control.engineStatus.detail.target` |
| DetailRow label `"suppression"` | `control.engineStatus.detail.suppression` |
| DetailRow label `"cooldowns"` | `control.engineStatus.detail.cooldowns` |
| DetailRow label `"allowlist"` | `control.engineStatus.detail.allowlist` |
| DetailRow label `"no-progress"` | `control.engineStatus.detail.noProgress` |

### ActiveSessionPanel.tsx mappings

| Hardcoded | Key |
| --- | --- |
| `"now watching"` | `control.activeSession.nowWatching` |
| `"no active session"` | `control.activeSession.noActiveSession` |
| `"last ping · {formatRelative}"` | use `t("control.activeSession.lastPing")` + ` · ` + `formatRelative(lastWatchOk)` (keep the time fragment hardcoded) |
| `"loading…"` | `control.activeSession.loading` |
| `"no stream"` | `control.activeSession.noStream` |
| pill `"live"` | `control.activeSession.live` |
| pill `"paused"` | `control.activeSession.paused` |
| `"active drop"` SectionLabel | `control.activeSession.activeDrop` |
| `{watched} watched · {required} required · eta {eta}` line | `control.activeSession.watchedRequiredEta` with placeholders |
| same without eta | `control.activeSession.watchedRequired` |
| `"no farmable drop on this channel"` | `control.activeSession.noFarmable` |
| `"engine idle"` | `control.activeSession.engineIdle` |
| `"viewers"` | `control.activeSession.viewers` |

### ChannelGridPanel.tsx mappings

| Hardcoded | Key |
| --- | --- |
| `"live channels"` SectionLabel | `control.channelGrid.header` |
| `"Refresh channel list"` title | `control.channelGrid.refreshTitle` |
| `"refresh"` button | `control.channelGrid.refresh` |
| `"select a target game in Priorities to see live channels"` | `control.channelGrid.noTarget` |
| `"watching"` pill | `control.channelGrid.watchingPill` |

### CampaignsPanel.tsx mappings

| Hardcoded | Key |
| --- | --- |
| `"no active campaigns"` | `control.campaignsPanel.empty` |
| `"campaigns"` SectionLabel | `control.campaignsPanel.header` |
| status `"claimed"` | `control.campaignsPanel.status.claimed` |
| status `"blocked"` | `control.campaignsPanel.status.blocked` |
| status `"live"` | `control.campaignsPanel.status.live` |
| status `"queued"` | `control.campaignsPanel.status.queued` |
| `"total"` footer | `control.campaignsPanel.footerTotal` |
| `{count} drops` footer | `t("control.campaignsPanel.footerDrops.{one|other}", { count })` |

### Steps

- [ ] Wire each file. Commit:
  ```
  feat(control): wire useI18n into EngineStatusPanel/ActiveSessionPanel/ChannelGridPanel/CampaignsPanel

  Replaces remaining hardcoded English literals with t() calls using
  new control.engineStatus.*, control.activeSession.*, control.channelGrid.*,
  control.campaignsPanel.* keys.
  ```

---

## Task 5: Wire Priority features

Start by scanning the priority feature folder to find ALL components:
```bash
ls src/renderer/features/priority/
```

For each component with hardcoded English, wire `useI18n` and use `priorities.state.*` keys for the state labels (`watching`, `target`, `live`, `idle`) and the new `priorities.row.dragAria` / `priorities.row.removeAria` for the aria-labels. For any other hardcoded strings discovered, add new keys to i18n.tsx in a Step-1 amendment commit if needed.

### PriorityRow.tsx mappings (known)

| Hardcoded | Key |
| --- | --- |
| `STATE_LABEL.watching` value `"watching"` | `priorities.state.watching` (existing) |
| `STATE_LABEL.target` value `"target"` | `priorities.state.target` (existing) |
| `STATE_LABEL.live` value `"live"` | `priorities.state.live` (existing) |
| `STATE_LABEL.idle` value `"idle"` | `priorities.state.idle` (existing) |
| `aria-label={\`Drag ${game}\`}` | `t("priorities.row.dragAria", { game })` |
| `aria-label={\`Remove ${game}\`}` | `t("priorities.row.removeAria", { game })` |

### Steps

- [ ] Scan priority components, build mapping for each. If new strings discovered, add keys to i18n.tsx (separate small commit before the wire-up commit). The mappings above are confirmed; others depend on what's there.
- [ ] Wire and commit:
  ```
  feat(priority): wire useI18n into priority components

  Reuses priorities.state.* for state labels and adds aria templates
  via priorities.row.dragAria/removeAria. Any per-file discoveries
  noted in the commit body.
  ```

---

## Task 6: Verify end-to-end

- [ ] Full check:
  ```bash
  npm run lint 2>&1 | tail -10   # 0 errors
  npx tsc --noEmit -p tsconfig.json 2>&1 | wc -l   # baseline ~21
  npm test 2>&1 | tail -5   # 214/214
  npm run build 2>&1 | tail -10   # clean
  ```
- [ ] Sanity grep — count remaining hardcoded English in scanned files. Run from repo root:
  ```bash
  grep -rE '\blabel="(?!.*\{)[A-Z]' src/renderer/features/{overview,inventory,control,priority}/ --include="*.tsx" | grep -v '\.test\.' | head -20
  ```
  Expected: very few hits, all explicable (e.g., props passed through to primitives).
- [ ] Branch summary:
  ```bash
  git log --oneline feat/design-overhaul-phase-8-i18n-wirings..HEAD
  ```
  Expected ~6 commits.

## Report

Per task: SHA. Final: lint/tsc/test/build + sanity grep summary.

---

## Out of Scope

- HeroPanel claim-now button wiring — separate phase
- formatters.ts time fragments — locked out (see decision 4); add TODO comment if not already there
- Light-mode visual polish — separate phase
- `--dp-*` token rename — separate phase
- Any new copy / UX changes — this is purely an i18n sweep

## Open items

- Some component files import `useI18n` already but only use it for ONE string (e.g., ActiveSessionPanel). Task 4 finalizes them. After this PR, every Phase 2-5 component is either fully i18n'd or doesn't need it.
- The `formatters.ts` "5m ago"/"2h ago" pattern could later be ICU-pluralized for proper DE rendering. Leave as-is.
- DE translations are best-effort. Native German speakers may want to refine some (e.g., "läuft gerade" vs "schaut gerade"). Improvements welcome in a follow-up.

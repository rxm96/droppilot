# Design Overhaul — Phase 10: HeroPanel Claim Wiring + Final i18n Followup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Two focused improvements:
1. Wire the HeroPanel "claim now" button to an actual manual-claim action, so users can trigger claims from Overview without switching to Inventory.
2. Add the 2 missing PriorityAddPanel aria-label i18n keys that the Phase 9 implementer skipped ("Add from drops" / "Add game manually").

**Architecture:** Expose `claimNowAll()` from `useInventory` (it has direct access to the claim engine), thread it through `useAppModel.heroProps` → `OverviewView` → `HeroPanel`. The claim engine itself is unchanged — we only add a callable surface.

**Tech Stack:** No new dependencies. Existing claim engine + i18n.

**Spec reference:** Phase 5 backlog item ("HeroPanel claim engine surfacing"); Phase 9 followup.

**Branch:** `feat/design-overhaul-phase-10-claim-wiring` (stacked on `feat/design-overhaul-phase-9-i18n-sweep`)

**PR target:** `feat/design-overhaul-phase-9-i18n-sweep` — GitHub auto-retargets.

### Locked decisions

1. **Manual claim claims ALL claimable items**, not just the current target's drops. Matches the button label "claim now" (singular in form, "all available" in spirit) and the auto-claim semantics. `autoClaimFromInventory` already does this.
2. **Manual claim bypasses the `autoClaim` setting** — the whole point of a manual button is to claim even when auto-claim is OFF.
3. **`claimNowAll` is async but returns void** — UI doesn't wait for completion; trusts the inventory refresh + `claimStatus` updates to settle the UI.
4. **In-flight state managed locally** in HeroPanel via `useState`. No new prop needed. Button disables while async call is pending.
5. **Inline success/error feedback** on HeroPanel via the existing `claimStatus` shape passed as a new optional prop. Shows for ~8s (already auto-clears in useAppModel).
6. **No new IPC, no new engine logic.** The engine is already correct.

### Pre-flight inventory (verified via investigation)

- `useInventory` returns 13 fields today; none of them is a claim trigger.
- `claimEngineRef` lives inside `useInventory` (private). It IS reachable through the engine instance for `claimNowAll`.
- `autoClaimFromInventory(items, deps)` is already async + reliable. It tracks per-drop retry backoff internally — manual call respects those.
- `useAppModel.heroProps` has 16 fields today; adding `onClaimNow` + `claimStatus` makes 18.
- `OverviewView`'s `OverviewProps` already takes `onPause` and `onSwitchTarget` callbacks — extending to `onClaimNow` is the same pattern.
- HeroPanel's claim-now button (line 124-131) is `disabled={!hasClaimable}` with no `onClick`. Plumb a callback in.

---

## File Structure

**Modified files:**
- `src/renderer/shared/hooks/inventory/useInventory.ts` — add `claimNowAll` callback, expose in return
- `src/renderer/shared/hooks/app/useAppModel.ts` — destructure `claimNowAll`, add `onClaimNow` + `claimStatus` to `heroProps`
- `src/renderer/features/overview/OverviewView.tsx` — accept + thread `onClaimNow` + `claimStatus` props
- `src/renderer/features/overview/HeroPanel.tsx` — accept new props, wire button, add in-flight state, optional inline feedback
- `src/renderer/App.tsx` — `overviewPropsExtended` adds `onClaimNow` + `claimStatus`
- `src/renderer/shared/i18n.tsx` — 2 new aria keys for PriorityAddPanel
- `src/renderer/features/priority/PriorityAddPanel.tsx` — wire the 2 aria labels

**Untouched:**
- `inventoryClaimEngine.ts` — engine logic is already correct
- IPC layer — no new electron channels needed
- Any other component

---

## Task 1: Expose `claimNowAll` from `useInventory`

**File:** `src/renderer/shared/hooks/inventory/useInventory.ts`

The hook already calls `claimEngineRef.current.autoClaimFromInventory(...)` inside `fetchInventory` (around line 279-285). Add a new `claimNowAll` callback that calls the same method imperatively, with the current `inventory.items` snapshot.

- [ ] **Step 1: Read the file**, focus on lines 1-50 (imports + hook signature), 60-110 (engine ref + dep gates), 275-295 (existing auto-claim invocation), 470-490 (return object).

- [ ] **Step 2: Add the `claimNowAll` callback.** Place it near the other `useCallback` declarations or just before the return statement. Implementation:

```ts
const claimNowAll = React.useCallback(async () => {
  if (inventory.status !== "ready") return;
  await claimEngineRef.current.autoClaimFromInventory(inventory.items, {
    claimDrop: (payload) => window.electronAPI.twitch.claimDrop(payload),
    onAuthError,
    onClaimed,
    setClaimStatus,
  });
}, [inventory, onAuthError, onClaimed, setClaimStatus]);
```

Notes:
- `inventory` is the current inventory state (object with `status` discriminator + `items` when ready).
- `onAuthError` and `onClaimed` come from `opts` (passed in via the hook's deps argument).
- `setClaimStatus` is the existing setter already returned by the hook.
- `claimEngineRef.current` is the engine instance (stable ref, no need in deps).
- Use `React.useCallback` — verify React is imported as default or namespace at the top.

- [ ] **Step 3: Add `claimNowAll` to the return object** (around line 473-489). One additional field.

- [ ] **Step 4: TSC + tests:**
  ```bash
  npx tsc --noEmit -p tsconfig.json 2>&1 | grep "useInventory" | head -10
  # expected: empty
  npm test 2>&1 | tail -5
  # expected: 214/214
  ```

- [ ] **Step 5: Branch check + commit:**
  ```bash
  git branch --show-current
  # expected: feat/design-overhaul-phase-10-claim-wiring
  git add src/renderer/shared/hooks/inventory/useInventory.ts
  git commit -m "feat(inventory): expose claimNowAll from useInventory

  Adds a manual claim trigger that invokes the existing
  InventoryClaimEngine.autoClaimFromInventory with the current
  inventory snapshot. Bypasses the autoClaim gate (auto path)
  so users can claim from a button even when auto-claim is off.

  No engine changes — only a new callable surface."
  ```

---

## Task 2: Wire `claimNowAll` through `useAppModel` → `heroProps`

**File:** `src/renderer/shared/hooks/app/useAppModel.ts`

- [ ] **Step 1: Destructure `claimNowAll`** from the `useInventory(...)` return (around lines 359-385). Add it to the list of destructured names.

- [ ] **Step 2: Add to `heroProps`** (around lines 1410-1427). Add two new fields just after `dropsClaimable` (or wherever logical):
```ts
onClaimNow: claimNowAll,
claimStatus,  // already destructured from useInventory
```
Verify `claimStatus` is already destructured; if not, add it.

- [ ] **Step 3: Verify no other consumer of `heroProps` breaks:**
  ```bash
  grep -rn "heroProps" src/renderer --include="*.tsx" --include="*.ts" | head -10
  ```
  The only consumer outside of useAppModel itself should be App.tsx (via `model.heroProps`).

- [ ] **Step 4: TSC + tests + lint:**
  ```bash
  npx tsc --noEmit -p tsconfig.json 2>&1 | grep "useAppModel" | head -10
  # expected: empty
  npm test 2>&1 | tail -5
  npm run lint 2>&1 | tail -5
  ```

- [ ] **Step 5: Commit:**
  ```bash
  git add src/renderer/shared/hooks/app/useAppModel.ts
  git commit -m "feat(app): surface claimNowAll + claimStatus to heroProps

  Adds onClaimNow (bound to useInventory's claimNowAll) and
  claimStatus to the heroProps bundle so HeroPanel can trigger
  manual claims and show inline feedback."
  ```

---

## Task 3: Thread + wire HeroPanel claim-now button

Three files touched in one task because they form a single chain.

### File 1: `src/renderer/App.tsx`

Add `onClaimNow` + `claimStatus` to the `overviewPropsExtended` useMemo (around line 143-152):
```tsx
const overviewPropsExtended = React.useMemo(
  () => ({
    ...overviewProps,
    onPause: controlProps.stopWatching,
    onSwitchTarget: () => setView("priorities"),
    onClaimNow: model.heroProps.onClaimNow,
    claimStatus: model.heroProps.claimStatus,
    refreshMinMs: settingsProps.refreshMinMs,
    refreshMaxMs: settingsProps.refreshMaxMs,
  }),
  [overviewProps, controlProps.stopWatching, setView, model.heroProps.onClaimNow, model.heroProps.claimStatus, settingsProps.refreshMinMs, settingsProps.refreshMaxMs],
);
```

Verify `model` is in scope (it is — it's destructured at the top of `AppShell`). If `heroProps` is not in the top-level destructure, add it there first.

### File 2: `src/renderer/features/overview/OverviewView.tsx`

Add to `OverviewProps`:
```ts
onClaimNow?: () => void | Promise<void>;
claimStatus?: { kind: "success" | "error"; message?: string; code?: string } | null;
```

Destructure them in the function param list. Pass through to `<HeroPanel ... onClaimNow={onClaimNow} claimStatus={claimStatus} />`.

### File 3: `src/renderer/features/overview/HeroPanel.tsx`

1. Add to `HeroPanelProps`:
```ts
onClaimNow?: () => void | Promise<void>;
claimStatus?: { kind: "success" | "error"; message?: string; code?: string } | null;
```

2. Destructure them in the function signature.

3. Add in-flight state:
```ts
const [claiming, setClaiming] = React.useState(false);

const handleClaim = React.useCallback(async () => {
  if (!onClaimNow || claiming) return;
  setClaiming(true);
  try {
    await onClaimNow();
  } finally {
    setClaiming(false);
  }
}, [onClaimNow, claiming]);
```

4. Update the claim button:
```tsx
<Button
  variant="dp-primary"
  size="dp-md"
  onClick={handleClaim}
  disabled={!hasClaimable || !onClaimNow || claiming}
  title={
    !onClaimNow
      ? t("hero.title.useInventoryToClaim")
      : !hasClaimable
        ? t("hero.title.noClaimableDrops")  // see step 6
        : claiming
          ? t("hero.title.claiming")  // see step 6
          : t("hero.title.claimNowReady")  // see step 6
  }
>
  <Check size={11} strokeWidth={2.2} /> {claiming ? t("hero.button.claiming") : t("hero.button.claimNow")}
</Button>
```

5. **Optional inline feedback** below the button row. Only when `claimStatus` is set and recent:
```tsx
{claimStatus && (
  <div
    className={cn(
      "mt-2 font-mono text-[10px]",
      claimStatus.kind === "success"
        ? "text-[color:var(--dp-signal-ok)]"
        : "text-[color:var(--dp-signal-err)]",
    )}
  >
    {claimStatus.kind === "success" && claimStatus.message
      ? claimStatus.message
      : claimStatus.kind === "error"
        ? claimStatus.message ?? t("hero.claimFeedback.errorFallback")
        : null}
  </div>
)}
```

Verify `cn` is imported (`import { cn } from "@renderer/shared/lib/utils";`) — add if missing.

6. **Add 4 new i18n keys** to `src/renderer/shared/i18n.tsx` for the new titles + button text + feedback fallback:
- `hero.title.noClaimableDrops` (EN: "No claimable drops right now" / DE: "Keine claimbaren Drops gerade")
- `hero.title.claiming` (EN: "Claiming…" / DE: "Claime…")
- `hero.title.claimNowReady` (EN: "Claim all available drops" / DE: "Alle verfügbaren Drops claimen")
- `hero.button.claiming` (EN: "claiming…" / DE: "claime…")
- `hero.claimFeedback.errorFallback` (EN: "Claim failed" / DE: "Claim fehlgeschlagen")

That's 5 keys × 2 langs = 10 lines added.

### Steps

- [ ] **Step 1:** Add the 5 new i18n keys (EN + DE) to i18n.tsx.
- [ ] **Step 2:** Edit App.tsx → OverviewView → HeroPanel per spec.
- [ ] **Step 3:** TSC + tests + lint.
- [ ] **Step 4:** Branch check + commit (single commit for the full chain):
  ```bash
  git add src/renderer/App.tsx src/renderer/features/overview/OverviewView.tsx src/renderer/features/overview/HeroPanel.tsx src/renderer/shared/i18n.tsx
  git commit -m "feat(overview): wire HeroPanel claim-now button end-to-end

  Threads onClaimNow + claimStatus from useAppModel.heroProps through
  overviewPropsExtended → OverviewView → HeroPanel. HeroPanel adds:
  - Local in-flight state to disable button + show 'claiming…' label
  - Dynamic title attribute reflecting state (no callback / no drops
    / in flight / ready)
  - Inline mono-text feedback row showing claimStatus success or
    error message for ~8s (the existing auto-clear in useAppModel)

  Adds 5 new i18n keys (EN+DE) for the new titles + button text +
  error fallback.

  The actual claim engine is unchanged — this is purely UI wiring
  on top of the manual claimNowAll surface exposed in T01-T02."
  ```

---

## Task 4: Add 2 missing PriorityAddPanel aria-labels (Phase 9 followup)

The Phase 9 implementer skipped 2 `aria-label` strings in `PriorityAddPanel.tsx`:
- `aria-label="Add from drops"`
- `aria-label="Add game manually"`

Argued they were "dev-level accessibility" — incorrect. aria-labels ARE user-visible (screen readers) and should be translated.

### Steps

- [ ] **Step 1: Add 2 new keys** to `src/renderer/shared/i18n.tsx`:
  - EN: `"priorities.add.fromDropsAria": "Add from drops"`, `"priorities.add.manualAria": "Add game manually"`
  - DE: `"priorities.add.fromDropsAria": "Von Drops hinzufügen"`, `"priorities.add.manualAria": "Spiel manuell hinzufügen"`

- [ ] **Step 2: Read `src/renderer/features/priority/PriorityAddPanel.tsx`** and locate the two `aria-label="..."` attributes. Replace each with `aria-label={t("priorities.add.fromDropsAria")}` and `aria-label={t("priorities.add.manualAria")}` respectively.

- [ ] **Step 3: TSC + tests + lint clean.**

- [ ] **Step 4: Commit:**
  ```bash
  git add src/renderer/shared/i18n.tsx src/renderer/features/priority/PriorityAddPanel.tsx
  git commit -m "feat(priority): i18n the 2 remaining PriorityAddPanel aria-labels

  Phase 9 implementer skipped 'Add from drops' and 'Add game manually'
  aria-labels as 'dev-level accessibility'. They're user-visible to
  screen readers and deserve translation.

  Adds priorities.add.fromDropsAria / priorities.add.manualAria
  (EN+DE) and wires both aria-label attributes."
  ```

---

## Task 5: Verify end-to-end

- [ ] **Step 1:** Full check suite:
  ```bash
  npm run lint 2>&1 | tail -10  # 0 errors, 4 pre-existing warnings
  npx tsc --noEmit -p tsconfig.json 2>&1 | wc -l  # ~baseline
  npm test 2>&1 | tail -5  # 214/214
  npm run build 2>&1 | tail -10  # clean
  ```

- [ ] **Step 2:** Branch summary:
  ```bash
  git log --oneline feat/design-overhaul-phase-9-i18n-sweep..HEAD
  # Expected: ~5-6 commits
  ```

- [ ] **Step 3:** Manual sanity grep:
  ```bash
  grep -E 'aria-label="(?!.*\{)[A-Z]' src/renderer/features --include="*.tsx" -rn | head -10
  # Expected: no PriorityAddPanel hits; other features may still have aria gaps
  ```

## Report

Per task: SHA. Final: lint/tsc/test/build + commit list.

---

## Out of Scope

- Per-drop claim controls (claim a specific drop from inventory) — out of scope; inventory view already handles per-row
- Claim engine refactor or any IPC changes — not needed
- New visual treatment for claim button — keeps existing dp-primary styling
- Light-mode polish — separate phase
- `--dp-*` token rename — separate phase
- Aria-label sweep for OTHER features beyond PriorityAddPanel — separate cleanup pass

## Open items

- Inline claim feedback shows the raw `message` from claimStatus, which is often something like `"Auto-claimed: Some Drop Title"`. Long titles may overflow the HeroPanel layout. If this becomes an issue, truncate or tooltip-it. Acceptable for v1.
- If the user clicks "claim now" multiple times rapidly, the in-flight gate prevents re-entry; but if `claimNowAll` resolves quickly between clicks, two engine calls could race. The engine's internal retry map mitigates this, but a true concurrency lock would be cleaner. Acceptable for v1.
- The claim engine's per-drop retry backoff is opaque to the UI — a user clicking "claim now" while a drop is in retry backoff will see nothing happen for that specific drop. No UX hint today. Future polish: surface retry state in `claimStatus`.

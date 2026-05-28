# Design Overhaul — Phase 7: Legacy Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Delete all orphaned legacy code from earlier design iterations. Three orphaned components, the Material Symbols font integration, and ~240 legacy CSS rules that are no longer referenced by any live `.tsx`. Plus clean up the 5 dead fields in `ControlProps`.

**Architecture:** Pure deletion. No new code, no rewrites. Each task is a verification-gated removal.

**Tech Stack:** React 19, Tailwind 4, no new dependencies.

**Spec reference:** [`../specs/2026-05-27-design-overhaul-design.md`](../specs/2026-05-27-design-overhaul-design.md) §10 "Cleanup / what to delete after migration".

**Branch:** `feat/design-overhaul-phase-7-cleanup` (stacked on `feat/design-overhaul-phase-6-settings`)

**PR target:** `feat/design-overhaul-phase-6-settings` — GitHub auto-retargets up the chain.

### Locked decisions

1. **No `--dp-*` rename in this phase** — deferred to a later phase (298 references across the codebase, high churn, deserves its own PR).
2. **No i18n sweep in this phase** — deferred. Settings copy stays English-only for now.
3. **No HeroPanel claim-now or Control tracker restoration** — deferred. Those are feature work, not cleanup.
4. **AppContent.tsx import fix**: the `import type { TopNav } from "./TopNav"` is used purely to type `navProps: ComponentProps<typeof TopNav>`. The actual shape we need is `{ view: ViewKey; setView: (v: ViewKey) => void }`. Replace with a small explicit local type.
5. **Legacy CSS deletion in 6 prefix-batched commits** for reviewability. After each batch: lint + tests + build must pass.

### Pre-flight inventory (verified before writing plan)

- `Hero.tsx`, `TitleBar.tsx`, `TopNav.tsx` — **zero imports outside themselves**. Safe to delete.
- `AppContent.tsx` line 11 — only place outside the three legacy files that imports anything from them (`type { TopNav }`).
- Material Symbols — referenced in `src/renderer/index.html` (Google Fonts `<link>`) and `src/renderer/app.css` (the `.material-symbols-rounded` rule at line 478). Nothing in `.tsx` references the font anymore.
- Legacy CSS class counts in `app.css`:
  - `.app-shell` — 1 rule
  - `.app-hero` — 0 rules
  - `.hero-*` — 62 rules
  - `.priority-*` — 35 rules
  - `.campaign-*` — 28 rules
  - `.inventory-*` — 13 rules
  - `.control-*` — 100 rules
  - **Total: ~239 rules** (matches the earlier 240 figure)
- All `className="..."` usages of these prefixes are inside `Hero.tsx` (which we're deleting in T03). Confirmed via:
  `grep -rE 'className=.*\b(priority-|campaign-|inventory-|control-|app-hero|app-shell|hero-)' src/renderer --include="*.tsx"` → 6 hits, all in Hero.tsx.
- `ControlProps` interface declares but does not destructure (line 84-107 of ControlView.tsx): `targetProgress`, `totalDrops`, `claimedDrops`, `canWatchTarget`, `refreshPriorityPlan`.
- Same 5 fields are produced by `useAppModel`'s `controlProps` (lines 1387, 1388, 1389, 1395, 1407 of `useAppModel.ts`).

---

## File Structure

**Files deleted:**
- `src/renderer/shared/components/Hero.tsx`
- `src/renderer/shared/components/TitleBar.tsx`
- `src/renderer/shared/components/TopNav.tsx`

**Files modified:**
- `src/renderer/index.html` — remove Google Fonts `<link>` for Material Symbols
- `src/renderer/app.css` — remove `.material-symbols-rounded` rule + all 6 prefix CSS regions
- `src/renderer/shared/components/AppContent.tsx` — replace `import type { TopNav }` with inline nav-props type
- `src/renderer/features/control/ControlView.tsx` — remove 5 dead fields from `ControlProps`
- `src/renderer/shared/hooks/app/useAppModel.ts` — remove same 5 fields from `controlProps` returned shape

**Untouched (intentionally):**
- All new primitives, chrome, and section components from Phases 1-6
- `--dp-*` token names (deferred)
- All i18n keys / translations (deferred)
- The 4 pre-existing lint warnings in DebugView/InventoryView/useAppModel (unrelated)

---

## Task 1: Remove Material Symbols `<link>` from `index.html`

The Google Fonts CDN link is dead weight: no `.tsx` uses the font, and the only remaining `app.css` rule (`.material-symbols-rounded`) is itself legacy.

**Files:** `src/renderer/index.html`

- [ ] **Step 1: Edit `index.html`** — delete the `<link>` lines (currently lines 6-9):

Before:
```html
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link
    rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,400,0,0"
  />
  <title>DropPilot</title>
</head>
```

After:
```html
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DropPilot</title>
</head>
```

- [ ] **Step 2: Verify branch + commit**

```bash
git branch --show-current
# expected: feat/design-overhaul-phase-7-cleanup

git add src/renderer/index.html
git commit -m "chore(chrome): remove Material Symbols Google Fonts link

No .tsx references the font anymore (replaced by Lucide in Phase 1).
The only remaining usage was the .material-symbols-rounded CSS rule
in app.css, which is itself legacy and removed in T02."
```

---

## Task 2: Remove `.material-symbols-rounded` rule from `app.css`

**Files:** `src/renderer/app.css`

- [ ] **Step 1:** Locate the rule. It starts at line 478 (`.material-symbols-rounded {`). Read 20 lines from line 477 to see the full rule block. Delete the entire `{...}` block (including any closing curly + trailing blank line).

- [ ] **Step 2:** Verify no other references remain:
```bash
grep -n "material-symbols" src/renderer/app.css
# expected: empty
```

- [ ] **Step 3:** Commit:
```bash
git add src/renderer/app.css
git commit -m "chore(css): remove .material-symbols-rounded legacy rule

The font itself was removed from index.html in T01; this rule
was its only consumer."
```

---

## Task 3: Delete orphaned `Hero.tsx`, `TitleBar.tsx`, `TopNav.tsx` + fix AppContent.tsx

**Pre-verified:** zero imports outside the files themselves, except `AppContent.tsx` line 11 (`import type { TopNav } from "./TopNav"`).

**Files:**
- Delete: `src/renderer/shared/components/Hero.tsx`
- Delete: `src/renderer/shared/components/TitleBar.tsx`
- Delete: `src/renderer/shared/components/TopNav.tsx`
- Modify: `src/renderer/shared/components/AppContent.tsx`

- [ ] **Step 1: Read `AppContent.tsx`** — confirm `navProps` is typed as `ComponentProps<typeof TopNav>`. The actual usage is just `navProps.view`. The real props passed in App.tsx come from `useAppModel`'s `navProps`, which has shape `{ view: ViewKey; setView: (v: ViewKey) => void; ... }`. We need an inline type.

- [ ] **Step 2: Edit `AppContent.tsx`**:

Replace:
```ts
import type { TopNav } from "./TopNav";
// ...
type AppContentProps = {
  /** Retained for compatibility with the existing useAppModel shape. */
  navProps: ComponentProps<typeof TopNav>;
  // ...
};
```

With:
```ts
// (delete the import line)
// ...
import type { ViewKey } from "@renderer/shared/types"; // or wherever ViewKey lives

type NavProps = {
  view: ViewKey;
  setView: (next: ViewKey) => void;
};

type AppContentProps = {
  navProps: NavProps;
  // ...
};
```

If `ViewKey` doesn't exist as a published type, define it inline based on the keys used in the JSX (`overview`, `inventory`, `priorities`, `settings`, `control`, `debug`). Verify by checking how `navProps.view` is consumed downstream — it's likely already a string union somewhere in `useAppModel`. Match that shape exactly.

- [ ] **Step 3: Delete the 3 files:**
```bash
rm src/renderer/shared/components/Hero.tsx
rm src/renderer/shared/components/TitleBar.tsx
rm src/renderer/shared/components/TopNav.tsx
```

- [ ] **Step 4: Verify**
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "Hero|TitleBar|TopNav|AppContent" | head -10
# expected: empty (or only pre-existing baseline errors)

npm test 2>&1 | tail -5
# expected: 214/214 passing

npm run build 2>&1 | tail -10
# expected: clean
```

- [ ] **Step 5: Commit:**
```bash
git add -A src/renderer/shared/components/
git commit -m "chore(chrome): delete orphaned Hero/TitleBar/TopNav

These three components were the legacy chrome stack, fully replaced
by chrome/Titlebar + chrome/AppNav + chrome/Statusbar in Phase 1.

Zero imports outside the files themselves (verified via grep).
AppContent.tsx had a vestigial \`import type { TopNav }\` purely
for ComponentProps shape — replaced with an inline NavProps type."
```

---

## Task 4: Delete `.app-shell` + `.app-hero` CSS rules (chunk 1)

**Files:** `src/renderer/app.css`

- [ ] **Step 1:** Locate `.app-shell` block (line 364). Read enough context to see the full rule.
- [ ] **Step 2:** Search for any `.app-hero*` rules: `grep -nE '^\.app-(shell|hero)' src/renderer/app.css`.
- [ ] **Step 3:** Delete the rule block(s).
- [ ] **Step 4:** Verify:
```bash
grep -nE '^\.app-(shell|hero)' src/renderer/app.css
# expected: empty
```
- [ ] **Step 5:** Commit:
```bash
git add src/renderer/app.css
git commit -m "chore(css): remove legacy .app-shell rules

Replaced by Tailwind utilities on the AppShell wrapper in Phase 1."
```

---

## Task 5: Delete `.hero-*` CSS rules (chunk 2, 62 rules)

**Files:** `src/renderer/app.css`

- [ ] **Step 1:** Find all `.hero-*` rule blocks: `grep -nE '^\.hero-' src/renderer/app.css`.
- [ ] **Step 2:** Delete each rule block. Use ripgrep / sed-style range deletion if possible, or manual chunked Edit calls — each rule block is bounded by `{` and the matching `}` (sometimes spanning multiple selectors via commas before the `{`).
- [ ] **Step 3:** Be careful with composite selectors like `.hero-foo, .hero-bar { ... }` — delete the whole block. Selectors mixing `.hero-*` with non-legacy classes are not expected (verified pre-flight) but if you find one, drop only the `.hero-*` selector portion and keep the rule.
- [ ] **Step 4:** Verify:
```bash
grep -nE '^\.hero-' src/renderer/app.css
# expected: empty

grep -cE '^\.' src/renderer/app.css
# Should be (previous-count) minus 62
```
- [ ] **Step 5:** Commit:
```bash
git add src/renderer/app.css
git commit -m "chore(css): remove 62 legacy .hero-* rules

Replaced by HeroPanel.tsx Tailwind utilities in Phase 2.
Zero .tsx files reference any .hero-* class after Hero.tsx
was deleted in T03."
```

---

## Task 6: Delete `.priority-*` CSS rules (chunk 3, 35 rules)

**Files:** `src/renderer/app.css`

- [ ] **Step 1:** Find all `.priority-*` blocks: `grep -nE '^\.priority-' src/renderer/app.css`.
- [ ] **Step 2:** Delete each rule block.
- [ ] **Step 3:** Verify: `grep -nE '^\.priority-' src/renderer/app.css` → empty.
- [ ] **Step 4:** Run `npm test 2>&1 | tail -5` → 214/214.
- [ ] **Step 5:** Commit:
```bash
git add src/renderer/app.css
git commit -m "chore(css): remove 35 legacy .priority-* rules

Replaced by PriorityCard/PriorityRow Tailwind utilities in Phase 4."
```

---

## Task 7: Delete `.campaign-*` CSS rules (chunk 4, 28 rules)

**Files:** `src/renderer/app.css`

- [ ] **Step 1:** Find: `grep -nE '^\.campaign-' src/renderer/app.css`.
- [ ] **Step 2:** Delete blocks.
- [ ] **Step 3:** Verify empty.
- [ ] **Step 4:** Commit:
```bash
git add src/renderer/app.css
git commit -m "chore(css): remove 28 legacy .campaign-* rules

Replaced by CampaignsPanel + campaign card Tailwind utilities
in Phase 5."
```

---

## Task 8: Delete `.inventory-*` CSS rules (chunk 5, 13 rules)

**Files:** `src/renderer/app.css`

- [ ] **Step 1:** Find: `grep -nE '^\.inventory-' src/renderer/app.css`.
- [ ] **Step 2:** Delete blocks.
- [ ] **Step 3:** Verify empty.
- [ ] **Step 4:** Commit:
```bash
git add src/renderer/app.css
git commit -m "chore(css): remove 13 legacy .inventory-* rules

Replaced by InventoryTable/Filter/Drawer Tailwind utilities
in Phase 3."
```

---

## Task 9: Delete `.control-*` CSS rules (chunk 6, 100 rules)

**Files:** `src/renderer/app.css`

This is the biggest chunk. ~100 rules.

- [ ] **Step 1:** Find: `grep -nE '^\.control-' src/renderer/app.css | wc -l` (expect 100).
- [ ] **Step 2:** Delete in sub-chunks if needed (e.g., split by sub-prefix `.control-drops`, `.control-header`, etc.). After each sub-chunk: commit nothing yet, just verify lint stays clean.
- [ ] **Step 3:** When all `.control-*` rules are gone: `grep -nE '^\.control-' src/renderer/app.css` → empty.
- [ ] **Step 4:** Verify `wc -l src/renderer/app.css` shows a significantly smaller file (should be roughly 5386 - 239 \* avg-rule-line-count ≈ <2000 lines, likely 800-1500).
- [ ] **Step 5:** Run `npm test 2>&1 | tail -5` → 214/214.
- [ ] **Step 6:** Commit:
```bash
git add src/renderer/app.css
git commit -m "chore(css): remove 100 legacy .control-* rules

Replaced by ControlView composition with EngineStatusPanel,
ActiveSessionPanel, CampaignsPanel, ChannelGridPanel in Phase 5.

This was the largest legacy block. Total app.css line count drops
substantially. No .tsx still references any .control-* class
(verified via grep before deletion)."
```

---

## Task 10: Clean up dead `ControlProps` fields

The 5 fields `targetProgress`, `totalDrops`, `claimedDrops`, `canWatchTarget`, `refreshPriorityPlan` are declared in the `ControlProps` interface (lines 44-50 + 73 of `ControlView.tsx`) but never destructured or used inside the function. They are produced by `useAppModel`'s `controlProps` (lines 1387-1389, 1395, 1407 of `useAppModel.ts`).

**Files:**
- `src/renderer/features/control/ControlView.tsx`
- `src/renderer/shared/hooks/app/useAppModel.ts`

- [ ] **Step 1: Edit `ControlView.tsx`** — remove these 5 lines from the `ControlProps` type:
```ts
targetProgress: number;
totalDrops: number;
claimedDrops: number;
refreshPriorityPlan: () => void;
canWatchTarget: boolean;
```

- [ ] **Step 2: Edit `useAppModel.ts`** — remove the same 5 keys from the `controlProps` object literal (lines 1387-1389, 1395, 1407). Approximate matches:
```ts
targetProgress,
totalDrops,
claimedDrops,
refreshPriorityPlan,
canWatchTarget,
```

- [ ] **Step 3: Verify those identifiers aren't used elsewhere:**
```bash
grep -nE "(targetProgress|totalDrops|claimedDrops|canWatchTarget|refreshPriorityPlan)" src/renderer/shared/hooks/app/useAppModel.ts
```
The grep will still show their definitions (declarations in inner hooks) — that's expected. The point is: they should NOT appear inside `controlProps = { ... }` block (lines 1384-1414).

If `overviewProps` or `priorityProps` still references them, leave THOSE references alone — they're independent of `controlProps`.

- [ ] **Step 4: Verify**
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "ControlView|useAppModel" | head -10
# expected: no new errors

npm test 2>&1 | tail -5
# expected: 214/214

npm run lint 2>&1 | tail -5
# expected: 0 errors (4 pre-existing warnings)
```

- [ ] **Step 5: Commit:**
```bash
git add src/renderer/features/control/ControlView.tsx src/renderer/shared/hooks/app/useAppModel.ts
git commit -m "chore(control): remove 5 dead ControlProps fields

targetProgress, totalDrops, claimedDrops, canWatchTarget, and
refreshPriorityPlan are declared in ControlProps but never
destructured nor used inside ControlView. The Phase 5 rewrite
adapted ControlView to use useControlViewState + sub-panels
that compute these locally.

Removes both the interface fields and the producer-side keys
in useAppModel.controlProps. Resolves the Phase 5 final-review
note about dead ControlProps fields."
```

---

## Task 11: Verify end-to-end

- [ ] **Step 1: Lint + TSC + Tests + Build**
```bash
npm run lint 2>&1 | tail -10
# expected: 0 errors, 4 pre-existing warnings

npx tsc --noEmit -p tsconfig.json 2>&1 | wc -l
# expected: ~baseline (18 pre-existing errors in unrelated files)

npm test 2>&1 | tail -5
# expected: 214/214

npm run build 2>&1 | tail -10
# expected: clean
```

- [ ] **Step 2: Branch summary**
```bash
git log --oneline feat/design-overhaul-phase-6-settings..HEAD
# Expected: ~10 commits (plan + 10 task commits)

wc -l src/renderer/app.css
# Expected: ~800-1500 (down from 5386)
```

- [ ] **Step 3: File count drop**
```bash
ls src/renderer/shared/components/ | grep -v chrome
# Expected: AppContent.tsx, Logo.tsx, UpdateOverlay.tsx, index.ts — no Hero/TitleBar/TopNav
```

## Report

Per phase task: SHAs. Final: full branch log, lint/tsc/test/build results, before/after line count for app.css.

---

## Out of Scope

- `--dp-*` token rename to plain names — deferred (298 references, deserves its own PR).
- Settings i18n sweep (~80 keys EN+DE) — deferred.
- HeroPanel claim-now button wiring — deferred (needs claim engine surfacing).
- Restore Control tracker status section — deferred (feature work).
- Light-mode polish sweep for Settings — deferred.
- Debug view token migration — already done in earlier work (verified: zero `debug-*` CSS class usage in DebugView.tsx).

## Open items

- After this PR lands, `src/renderer/app.css` will still contain `--dp-*` tokens, the `:where(button)` cleanup from PR #25, and various non-prefix utility helpers. The file should be well under 2000 lines but is not yet at "nothing left to delete" state. A future pass can split tokens into a dedicated `tokens.css` if desired.
- The legacy CSS deletion is mechanical but tedious. Implementer agents should be patient and verify each chunk with grep before moving to the next. If the agent gets confused mid-chunk, they should stop and report rather than guess at boundaries.

# Design Overhaul — Phase 11: Light-Mode Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Surgical pass to fix hardcoded color literals in components and CSS that bypass the `--dp-*` token system and break (or look off) in light mode.

**Architecture:** No new components, no rewrites. Replace hardcoded `rgba()` / `#xxx` literals with token-aware alternatives (CSS variables or `color-mix()` calls) so theme swap propagates correctly. Add 1 new token where needed.

**Tech Stack:** No new deps. `color-mix()` is well-supported in Electron's Chromium.

**Spec reference:** Phase 1 token system + investigation report.

**Branch:** `feat/design-overhaul-phase-11-light-mode` (stacked on `feat/design-overhaul-phase-10-claim-wiring`)

**PR target:** `feat/design-overhaul-phase-10-claim-wiring` — auto-retargets.

### Locked decisions

1. **Token system is sound** — Phase 11 only fixes consumers, not the token map itself. All 18 `--dp-*` tokens already have dark + light values.
2. **One new token** — `--dp-image-overlay` for thumbnail dark gradient (so the overlay tracks the page bg, not a hardcoded dark navy).
3. **`color-mix()` for tint backgrounds** — replaces all `rgba(<signal-color>, 0.08)` literals in badge/pill/feed-item with `color-mix(in srgb, var(--dp-signal-X) 10%, transparent)`. Keeps the tint following the token shift.
4. **Drop shadows on dark backdrops** (`bg-black/40`, `bg-black/80`) stay as-is — they're intentional scrims that read as "modal" regardless of theme.
5. **No new visual treatment** — this PR is purely about making existing visuals theme-correct, not redesigning anything.

### Pre-flight inventory (from audit)

5 high/medium-severity hardcoded color issues:
- `ChannelGridPanel.tsx:142` — dark gradient overlay on thumbnails
- `HeroPanel.tsx:82` — radial accent glow with hardcoded RGB
- `HeroPanel.tsx:118` + `ActiveSessionPanel.tsx:124` — progress bar gradient endpoint `#c4b5fd`
- `badge.tsx`, `pill.tsx`, `feed-item.tsx` — signal color tints using hardcoded dark-palette rgba
- `app.css` `.update-overlay-*` family — entirely dark-hardcoded backgrounds

Plus 2 low-severity token consistency fixes:
- `button.tsx:19` — text color `text-[#0a0b0d]` should be `text-[color:var(--dp-bg-app)]`
- `Logo.tsx:46,53` — stroke `#0a0b0d` should be a token reference

---

## File Structure

**Modified files:**
- `src/renderer/app.css` — add `--dp-image-overlay` token + light-mode overrides for `.update-overlay*` family
- `src/renderer/features/control/ChannelGridPanel.tsx` — use new token for thumbnail overlay
- `src/renderer/features/overview/HeroPanel.tsx` — replace radial glow + progress gradient endpoint
- `src/renderer/features/control/ActiveSessionPanel.tsx` — replace progress gradient endpoint
- `src/renderer/shared/components/ui/badge.tsx` — color-mix for signal tints
- `src/renderer/shared/components/ui/pill.tsx` — color-mix for signal tints
- `src/renderer/shared/components/ui/feed-item.tsx` — color-mix for signal tints
- `src/renderer/shared/components/ui/button.tsx` — token-ref text color
- `src/renderer/shared/components/Logo.tsx` — token-ref stroke

**Untouched:**
- `--dp-*` token values themselves — solid as-is
- Component layouts / structure — purely color changes
- `bg-black/40` and `bg-black/80` scrims — intentional dark modal backdrops
- Other components not in the audit's risk list

---

## Task 1: Add `--dp-image-overlay` token + fix ChannelGridPanel thumbnail overlay

**Files:** `src/renderer/app.css`, `src/renderer/features/control/ChannelGridPanel.tsx`

The thumbnail gradient `linear-gradient(to top, rgba(10,11,13,0.5) 0%, rgba(10,11,13,0.0) 35%)` is hardcoded dark and creates a visible dark strip on light mode thumbnails. Introduce a token that resolves to a theme-appropriate base color at 50% alpha.

### Steps

- [ ] **Step 1: Add token to `:root` (dark) block** in `app.css` (around line 263-295, near other `--dp-bg-*` tokens):
  ```css
  --dp-image-overlay: rgba(10, 11, 13, 0.5);
  ```

- [ ] **Step 2: Add light override** in `:root:not(.dark)` block (around line 298-onwards):
  ```css
  --dp-image-overlay: rgba(250, 250, 249, 0.55);
  ```
  (Uses the light `--dp-bg-app` base `#fafaf9` at ~55% alpha — slightly higher than dark to maintain readability of the channel-name overlay.)

- [ ] **Step 3: Edit `ChannelGridPanel.tsx:142`** — replace the gradient:
  ```tsx
  // before:
  background: "linear-gradient(to top, rgba(10,11,13,0.5) 0%, rgba(10,11,13,0.0) 35%)"

  // after:
  background: "linear-gradient(to top, var(--dp-image-overlay) 0%, transparent 35%)"
  ```
  Notes:
  - Use `transparent` instead of `rgba(10,11,13,0.0)` since the latter mathematically equals transparent regardless of color, but the explicit keyword is clearer.
  - If there are sibling gradients in the same file (e.g., upper overlay), apply the same pattern.

- [ ] **Step 4: TSC + tests + lint:**
  ```bash
  npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "ChannelGridPanel" | head -5
  # expected: empty
  npm test 2>&1 | tail -5
  npm run lint 2>&1 | tail -5
  ```

- [ ] **Step 5: Branch check + commit:**
  ```bash
  git branch --show-current
  # expected: feat/design-overhaul-phase-11-light-mode

  git add src/renderer/app.css src/renderer/features/control/ChannelGridPanel.tsx
  git commit -m "feat(theme): add --dp-image-overlay + fix ChannelGrid thumbnail overlay

  New --dp-image-overlay token resolves to rgba(10,11,13,0.5) in dark
  mode and rgba(250,250,249,0.55) in light mode. ChannelGridPanel's
  hardcoded dark thumbnail gradient was creating a visible dark strip
  at the bottom of channel cards in light mode — now it tracks the
  page bg.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
  ```

---

## Task 2: Token-aware signal-color tints in badge / pill / feed-item

**Files:**
- `src/renderer/shared/components/ui/badge.tsx`
- `src/renderer/shared/components/ui/pill.tsx`
- `src/renderer/shared/components/ui/feed-item.tsx`

All three use hardcoded `rgba(74,222,128,0.08)` (ok green), `rgba(251,191,36,0.08)` (warn amber), `rgba(248,113,113,0.08)` (err red), `rgba(96,165,250,0.08)` (info blue) for tinted backgrounds. In light mode the text color shifts via `var(--dp-signal-X)` but the tint base color doesn't, creating a slight hue mismatch.

Replace each `rgba(...)` with `color-mix(in srgb, var(--dp-signal-X) Y%, transparent)` where Y matches the original alpha × 100.

### Conversion rules

| Hardcoded value | Replacement |
|---|---|
| `rgba(74,222,128,0.08)` | `color-mix(in srgb, var(--dp-signal-ok) 8%, transparent)` |
| `rgba(74,222,128,0.18)` (border variant) | `color-mix(in srgb, var(--dp-signal-ok) 18%, transparent)` |
| `rgba(74,222,128,0.10)` | `color-mix(in srgb, var(--dp-signal-ok) 10%, transparent)` |
| `rgba(74,222,128,0.20)` | `color-mix(in srgb, var(--dp-signal-ok) 20%, transparent)` |
| `rgba(251,191,36,0.08)` | `color-mix(in srgb, var(--dp-signal-warn) 8%, transparent)` |
| `rgba(251,191,36,0.18)` | `color-mix(in srgb, var(--dp-signal-warn) 18%, transparent)` |
| `rgba(248,113,113,0.08)` | `color-mix(in srgb, var(--dp-signal-err) 8%, transparent)` |
| `rgba(248,113,113,0.18)` | `color-mix(in srgb, var(--dp-signal-err) 18%, transparent)` |
| `rgba(248,113,113,0.20)` | `color-mix(in srgb, var(--dp-signal-err) 20%, transparent)` |
| `rgba(96,165,250,0.08)` | `color-mix(in srgb, var(--dp-signal-info) 8%, transparent)` |
| `rgba(96,165,250,0.18)` | `color-mix(in srgb, var(--dp-signal-info) 18%, transparent)` |
| `rgba(154,160,168,0.06)` (dim variant base) | `color-mix(in srgb, var(--dp-text-dim) 6%, transparent)` |
| `rgba(154,160,168,0.12)` | `color-mix(in srgb, var(--dp-text-dim) 12%, transparent)` |

Tailwind 4 accepts `color-mix()` inside arbitrary brackets: `bg-[color-mix(in_srgb,var(--dp-signal-ok)_8%,transparent)]`. Note the underscore-spaces (Tailwind syntax) since spaces inside arbitrary values are escaped.

### Steps

- [ ] **Step 1: Edit `pill.tsx`** — locate the `cva` config (~line 5-21). Replace each `bg-[rgba(...)]` and `border-[rgba(...)]` arbitrary value with `bg-[color-mix(...)]` form per the table above.

- [ ] **Step 2: Edit `badge.tsx`** — locate the variant config and apply the same pattern.

- [ ] **Step 3: Edit `feed-item.tsx`** — locate the tone styling and apply the same pattern.

- [ ] **Step 4: TSC + tests + lint clean.**

- [ ] **Step 5: Commit:**
  ```bash
  git add src/renderer/shared/components/ui/badge.tsx src/renderer/shared/components/ui/pill.tsx src/renderer/shared/components/ui/feed-item.tsx
  git commit -m "feat(theme): use color-mix() for signal-tinted backgrounds

  badge, pill, and feed-item used hardcoded rgba() literals with the
  dark-mode signal-color base values for their tinted backgrounds. The
  text color adapted via tokens but the tint hue didn't — so in light
  mode a 'warn' pill would have a warm amber text on a cold amber tint.

  Replaces all such rgba() usages with color-mix(in srgb, var(--dp-signal-X) Y%, transparent)
  so the tint follows the token shift. No visual change in dark mode;
  light mode tints now match the text hue.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
  ```

---

## Task 3: HeroPanel + ActiveSessionPanel decorative gradients

**Files:**
- `src/renderer/features/overview/HeroPanel.tsx`
- `src/renderer/features/control/ActiveSessionPanel.tsx`

Two issues:
1. HeroPanel decorative radial glow uses `rgba(167,139,250,0.10)` (dark-mode accent literal)
2. Progress bar gradient endpoint `#c4b5fd` is a hardcoded light violet

### Steps

- [ ] **Step 1: Edit `HeroPanel.tsx`** decorative radial glow (around line 82):
  ```tsx
  // before:
  "radial-gradient(ellipse at top right, rgba(167,139,250,0.10), transparent 65%)"

  // after:
  "radial-gradient(ellipse at top right, var(--dp-accent-soft), transparent 65%)"
  ```
  `--dp-accent-soft` already has correct light + dark values.

- [ ] **Step 2: Edit `HeroPanel.tsx`** progress bar gradient (around line 118):
  ```tsx
  // before:
  "linear-gradient(90deg, var(--dp-accent), #c4b5fd)"

  // after:
  "linear-gradient(90deg, var(--dp-accent), color-mix(in srgb, var(--dp-accent) 60%, white))"
  ```
  This generates a lighter accent endpoint that tracks the theme — in dark mode it remains a light violet (since dark accent + 40% white ≈ #c4b5fd-ish); in light mode it lightens the light accent instead of locking to a fixed value.

- [ ] **Step 3: Edit `ActiveSessionPanel.tsx`** progress bar gradient — apply the SAME fix as HeroPanel step 2.

- [ ] **Step 4: TSC + tests + lint clean.**

- [ ] **Step 5: Commit:**
  ```bash
  git add src/renderer/features/overview/HeroPanel.tsx src/renderer/features/control/ActiveSessionPanel.tsx
  git commit -m "feat(theme): theme-aware accent gradients in Hero + ActiveSession

  HeroPanel decorative radial glow was rgba(167,139,250,0.10) — the
  dark-mode accent literal. Replaced with var(--dp-accent-soft) which
  is correctly token-remapped.

  Progress bar gradients in HeroPanel + ActiveSessionPanel had a
  hardcoded #c4b5fd endpoint that locked the lighter end of the
  gradient to a fixed violet. Replaced with color-mix(in srgb,
  var(--dp-accent) 60%, white) which lightens the current accent
  by mixing with white — works in both themes.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
  ```

---

## Task 4: Update overlay light-mode backgrounds

**File:** `src/renderer/app.css`

`.update-overlay`, `.update-overlay-card`, `.update-splash-card`, and `.update-overlay-notes` (around lines 487-700) have entirely hardcoded dark navy backgrounds. The update flow happens at install/check moments — looking like a "rendering bug" because the modal is dark navy on a light app is bad UX.

### Strategy

Two approaches:
- **A:** Replace the literal rgba() backgrounds with token references that swap per theme
- **B:** Add `:root:not(.dark)` overrides that re-declare just the backgrounds

Approach B is cleaner because the dark navy gradient is well-tuned for dark mode — we want a different (lighter) gradient for light mode, not just a tint shift.

### Steps

- [ ] **Step 1: Read `app.css`** sections for `.update-overlay`, `.update-overlay-card`, `.update-splash-card`, `.update-overlay-notes` (grep for `update-overlay\|update-splash` to find line ranges).

- [ ] **Step 2: Add a `:root:not(.dark)` block** (somewhere near the existing `:root:not(.dark)` block in app.css, OR at the bottom of the update-overlay CSS section) that overrides the backgrounds for light mode:
  ```css
  :root:not(.dark) .update-overlay {
    background: radial-gradient(
      circle at center,
      rgba(167, 139, 250, 0.10) 0%,
      rgba(124, 95, 230, 0.06) 35%,
      rgba(255, 255, 255, 0.92) 100%
    );
    backdrop-filter: blur(10px);
  }

  :root:not(.dark) .update-overlay-card {
    background: linear-gradient(160deg, rgba(255, 255, 255, 0.98), rgba(247, 246, 243, 0.99)), var(--dp-bg-elevated);
    border-color: var(--dp-border);
    color: var(--dp-text);
  }

  :root:not(.dark) .update-splash-card {
    background: linear-gradient(160deg, rgba(255, 255, 255, 0.98), rgba(247, 246, 243, 0.99)), var(--dp-bg-elevated);
  }

  :root:not(.dark) .update-overlay-notes {
    background: rgba(247, 246, 243, 0.9);
    color: var(--dp-text-dim);
  }
  ```
  The exact selectors and properties depend on what's there — read the file first and only override the BACKGROUND-related properties. Keep all other declarations (sizes, padding, shadows) inherited from the original rules.

- [ ] **Step 3: TSC + tests + lint.**

- [ ] **Step 4: Commit:**
  ```bash
  git add src/renderer/app.css
  git commit -m "feat(theme): light-mode backgrounds for .update-overlay family

  The update overlay, card, splash, and notes panels had entirely
  dark navy hardcoded backgrounds. Looked like a rendering bug when
  the user was in light mode and an update prompt appeared.

  Adds :root:not(.dark) overrides that re-style the backgrounds for
  light mode while preserving sizes/padding/shadow. The user-facing
  surface is now a light gradient with a subtle violet accent halo
  (mirroring the dark version's tone).

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
  ```

---

## Task 5: Small token-consistency fixes (Button + Logo)

**Files:**
- `src/renderer/shared/components/ui/button.tsx`
- `src/renderer/shared/components/Logo.tsx`

Two single-line fixes for code hygiene. Visual effect is essentially nil in both themes because the hardcoded values match the token values today — but referencing the token means future palette tweaks propagate.

### Steps

- [ ] **Step 1: Edit `button.tsx:19`** — replace `text-[#0a0b0d]` with `text-[color:var(--dp-bg-app)]`. Verify the `dp-primary` variant still reads correctly: the dark accent button has dark text from `--dp-bg-app` (dark mode value `#0a0b0d`), and the light accent button has light text from `--dp-bg-app` (light mode `#fafaf9`). Wait — light accent button (violet) with `#fafaf9` near-white text is much harder to read than dark text on the same violet. Reconsider:
  - The dark accent (`#a78bfa` purple) needs dark text → `#0a0b0d` works in dark mode
  - The light accent (`#7c5fe6` violet) is a darker purple → still needs dark/black text for contrast
  - Better fix: introduce a new token `--dp-on-accent` that's always near-black in both themes, OR keep `text-[#0a0b0d]` because it actually works for both
  - **Recommendation: leave `text-[#0a0b0d]` as-is** since it's the correct text color for an accent-bg button in both themes. Document this in the commit.

- [ ] **Step 2: Edit `Logo.tsx:46,53`** — same reasoning. The strokes `#0a0b0d` ARE near-black, which is the right color regardless of theme (assuming logo is always rendered on a light or near-light surface). Verify the logo's parent container's background in usage; if it's always a light surface, leave as-is. If it appears on dark surfaces too, the stroke needs to invert.
  - Grep usage: where is `<Logo />` rendered?
  ```bash
  grep -rn "<Logo" src/renderer --include="*.tsx" | head -10
  ```
  - **Decision:** if logo is always on a chrome-tinted background (titlebar or sidebar), it works in both themes (dark text on chrome bg ≈ dark mode chrome is `#08090b` near black — strokes WOULD be invisible). Investigate.

### Adjusted approach

Given the complexity, T05 becomes an INVESTIGATION:
- [ ] **Step A:** Find every `<Logo>` usage. Determine bg context.
- [ ] **Step B:** If logo strokes need to invert, change `#0a0b0d` → `currentColor` and set `color: var(--dp-text)` on the wrapper. If they don't need inversion, document why in a comment.
- [ ] **Step C:** Re button.tsx text color: keep as-is, but add a comment explaining why `#0a0b0d` is correct for both themes.
- [ ] **Step D:** Commit ONLY if any actual change. If just adding clarifying comments, fold into T06 verify.

This task is the most uncertain. If unclear, skip it and document as a follow-up.

---

## Task 6: Verify end-to-end

- [ ] **Step 1: Full check:**
  ```bash
  npm run lint 2>&1 | tail -10  # 0 errors
  npx tsc --noEmit -p tsconfig.json 2>&1 | wc -l  # baseline ~21
  npm test 2>&1 | tail -5  # 214/214
  npm run build 2>&1 | tail -10  # clean
  ```

- [ ] **Step 2: Sanity grep — remaining hardcoded color literals:**
  ```bash
  grep -rnE 'rgba\([0-9]+' src/renderer/features src/renderer/shared/components --include="*.tsx" | grep -v "color-mix" | head -20
  ```
  Expected: only intentional cases (drop-shadows, scrims, etc.).

- [ ] **Step 3: Branch summary:**
  ```bash
  git log --oneline feat/design-overhaul-phase-10-claim-wiring..HEAD
  # Expected: 5-6 commits
  ```

## Report

Per task: SHA. Final: lint/tsc/test/build + grep summary.

---

## Out of Scope

- Manual visual pass with screenshots — out of scope for an agentic implementation, but recommended as a follow-up before merging the stack
- WCAG AA contrast audit of all text/bg pairings — could be a separate accessibility-focused phase
- Refactoring the parallel legacy `:root` token system → all `--dp-*` (still planned for Phase 12)
- Refining the light-mode accent color hue (`#7c5fe6` is fine but might benefit from a tweak)
- Adding `--dp-on-accent` semantic token for accent-bg text color (deferred; current `#0a0b0d` works in both themes)

## Open items

- Light-mode `--dp-text-dimmer` (`#8a8f96`) on `--dp-bg-elevated-2` (`#f7f6f3`) may not clear WCAG AA (4.5:1) for small text. If verified low, bump `--dp-text-dimmer` to e.g. `#6b7280` in light mode.
- The `color-mix()` syntax is well-supported in modern Chromium (which Electron uses), but if a user opens dev tools they may see weird intermediate states. Acceptable.
- The progress-gradient endpoint via `color-mix(... 60%, white)` may render slightly differently than the hardcoded `#c4b5fd` in dark mode. If pixel-perfect parity is needed, retain the hardcoded value for dark mode and switch only in light. Decided: token-aware version is better for both themes.

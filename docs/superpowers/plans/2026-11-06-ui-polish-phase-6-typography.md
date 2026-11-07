# UI Polish Phase 6 — Typography Sweep, Light Mode, Demo Account Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Executed inline (autonomous run).

**Goal:** Finish the redesign. Apply the spec's type rule (mono for data and labels, sans for
prose) to every component that phases 2–5 did not rewrite, fix the demo account row in
settings, and remove light-mode problems found in code.

**Spec:** `docs/superpowers/specs/2026-11-06-ui-polish-redesign-design.md` (Decisions →
Typography, phase 6). **Mockups:** `Polished`, `PolSettings` (`.k` = mono 11px dim for kickers
and hints, `.btn` / `.sel` / `.tab` = mono 12px, prose = Plex Sans).

## Global constraints

Same as phases 1–5: pure-function tests only, EN + DE keys, CHANGELOG lines, prettier,
Conventional Commits with the `Co-Authored-By` trailer, no watch-engine behavior change.
No window launches this run (no visual check).

## Facts

- The prose font is Tailwind's default `font-sans` (`--font-sans` in `@theme`, set on `body`;
  the font pair setting overrides it). There is no `--dp-font-sans`. Sans is the inherited
  default, so "make it sans" means removing `font-mono` (and `uppercase` / wide tracking when
  they only existed for the mono kicker look).
- All app `Button`s use `dp-*` variants; all `Input` / `Select` uses pass `tone="dp"`. The
  legacy shadcn variants (`default`, `secondary`, `outline`, `ghost`, `destructive`, `muted`,
  tone `default`) are used nowhere, not even on `main` (checked with `git grep`).
- The account chip in the nav shows the profile name when `auth.status === "ok" || demoMode`.
  `settingsProps.isLinked` is the real `auth.status === "ok"`, so demo mode reads "Not signed
  in · sign in" in settings while the nav says "Demo Pilot". On `main` (a594216) the old
  AccountSection had the same root cause (a "not linked" pill and a sign-in button in demo
  mode); the new row only made it visible by showing a name.

## Tasks

- [ ] **Demo account row (TDD).** `features/settings/sections/accountRow.ts`:
      `accountRowState({ isLinked, demoMode, profile })` → `{ name, statusKey, action }` with
      `action: "logout" | "login" | "none"`. Demo mode → demo profile name, "demo account" status,
      no account button. Test first, watch it fail, then wire `AccountUpdatesSection` (pass
      `demoMode` from `SettingsView`).
- [ ] **Primitives.** Drop the unused legacy shadcn variants from `button`, `badge`, `input`,
      `select`; `card` and the button base class use `--dp-*` (focus ring = accent).
- [ ] **Light mode.** Add `--dp-ink` (dark text on accent / signal fills, same value in both
      themes) and use it for `dp-primary`, the nav badge, the reset-stats confirm, the update
      install button and the accent swatch checks (the nav badge used `--dp-bg-app`, which is
      near-white in light mode on amber). Replace dark-only `rgba(...)` in the drawer's blocked box
      and the session banner's glow with `color-mix` on tokens. The settings toggle knob follows
      the mockup (dim when off, ink when on) instead of white, which vanished on the light track.
- [ ] **Typography.** Chrome, update overlay, debug view, remaining sentences (empty states,
      status and error messages) → sans; kickers in the update overlay → mono like every other
      kicker. Debug buttons lowercase like every other button. Lowercase-start empty-state
      sentences get sentence case.
- [ ] **Dead code.** Script-check i18n keys added/left unused by phases 2–5; remove only
      provably unused ones.
- [ ] **CHANGELOG** + rulings in `.superpowers/redesign-progress.md`; lint, format:check,
      typecheck, test, build.

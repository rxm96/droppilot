# Design Overhaul — Phase 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the new design token system, restyle the 5 existing UI primitives, ship 5 new display primitives, and ship 3 new chrome layout components — all additive, so the current app continues to render unchanged until views are migrated in Phase 2+.

**Architecture:** Additive token + component layer. New CSS variables sit alongside the existing ones in `app.css` (no rename, no replace). New primitive variants extend existing CVA configs (keep backward-compatible defaults). New chrome components live in a fresh `src/renderer/shared/components/chrome/` folder and are demoed via a dev-only `#dev-primitives` route — they are NOT wired into `App.tsx` in this phase. Existing components (TitleBar, TopNav, OverviewView, etc.) and the Material Symbols font import remain untouched.

**Tech Stack:** Tailwind CSS 4 (CSS-first `@theme`), React 19, CVA, Radix UI, `lucide-react`, IBM Plex Sans + Mono.

**Spec reference:** [`../specs/2026-05-27-design-overhaul-design.md`](../specs/2026-05-27-design-overhaul-design.md)

**Branch:** `feat/design-overhaul`

### Deviations from spec

1. **Token strategy — `--dp-*` prefix instead of an "alias layer".** The spec envisioned renaming existing CSS variables to new ones and adding back-compat aliases. In practice, the existing app.css has 80+ CSS variables deeply consumed by legacy classes (`.pill`, `.card`, `.top-nav-*`, etc.); changing their values would visually shift every old view immediately. The plan uses a parallel `--dp-*` namespace so legacy renders untouched. Phase 6 still ends the same: legacy vars deleted, `--dp-` prefix dropped, new tokens become the only tokens.
2. **Material Symbols `<link>` removal deferred to Phase 6.** Spec puts it in Phase 1; doing so would render old TitleBar/TopNav/Hero icons broken because they still use `.material-symbols-rounded` classes. To honor the additive principle, the font import stays until every consuming view is migrated.

---

## File Structure

**New files:**
- `src/renderer/shared/lib/icons.ts` — central re-export of all Lucide icons used in the codebase
- `src/renderer/shared/components/Logo.tsx` — Droppilot brand mark (SVG)
- `src/renderer/shared/components/ui/pill.tsx`
- `src/renderer/shared/components/ui/section-label.tsx`
- `src/renderer/shared/components/ui/stat.tsx`
- `src/renderer/shared/components/ui/feed-item.tsx`
- `src/renderer/shared/components/ui/table.tsx`
- `src/renderer/shared/components/chrome/Titlebar.tsx`
- `src/renderer/shared/components/chrome/AppNav.tsx`
- `src/renderer/shared/components/chrome/Statusbar.tsx`
- `src/renderer/shared/components/chrome/index.ts`
- `src/renderer/features/dev-primitives/DevPrimitivesView.tsx`
- `src/renderer/features/dev-primitives/index.ts`

**Modified files:**
- `package.json` — add `lucide-react` dependency
- `src/renderer/app.css` — add new color tokens, radius scale, `@theme` mappings (NO removals)
- `src/renderer/shared/components/ui/button.tsx` — extend `variant` and `size` CVA, keep existing defaults
- `src/renderer/shared/components/ui/badge.tsx` — extend `variant` CVA
- `src/renderer/shared/components/ui/card.tsx` — add `CardAction` export
- `src/renderer/shared/components/ui/input.tsx` — restyle classes (no API change)
- `src/renderer/shared/components/ui/select.tsx` — restyle trigger and item classes (no API change)
- `src/renderer/App.tsx` — add dev-only `#dev-primitives` route check at the top

**Untouched (intentionally):**
- `src/renderer/index.html` — Material Symbols `<link>` stays (still used by old TitleBar/TopNav)
- `src/renderer/shared/components/TitleBar.tsx`, `TopNav.tsx`, `AppContent.tsx`, `Hero.tsx`, `UpdateOverlay.tsx`
- All `src/renderer/features/*` views except the new `dev-primitives`
- The existing CSS classes and CSS variables in `app.css` (legacy `.pill`, `.card`, `.top-nav-*`, `--background`, `--foreground`, `--primary`, etc.)

---

## Token Naming Convention

To avoid colliding with existing variables (`--background`, `--foreground`, `--card`, `--primary`, etc.), all new tokens are prefixed with `--dp-` (for "DropPilot Phase-2 design system"). Phase 6 final cleanup will rename `--dp-*` back to plain names after the legacy variables are deleted.

---

## Task 1: Install lucide-react

**Files:**
- Modify: `package.json`
- Generated: `package-lock.json` (or `pnpm-lock.yaml` depending on what the repo uses)

- [ ] **Step 1: Detect lockfile**

Run: `ls package-lock.json pnpm-lock.yaml yarn.lock 2>&1 | head -3`

Expected: One of `package-lock.json`, `pnpm-lock.yaml`, or `yarn.lock` exists. Use the matching package manager for Step 2.

- [ ] **Step 2: Install lucide-react**

For npm: `npm install lucide-react@^0.460.0`
For pnpm: `pnpm add lucide-react@^0.460.0`
For yarn: `yarn add lucide-react@^0.460.0`

Expected: dependency added to `package.json`, lockfile updated. No peer dependency warnings (lucide-react works with React 19).

- [ ] **Step 3: Verify install**

Run: `node -e "console.log(require('lucide-react/package.json').version)"`

Expected: prints a `0.460.x` or newer version. Bash echoes the version, exit 0.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json pnpm-lock.yaml 2>/dev/null
git commit -m "chore(deps): add lucide-react for new icon system

Lucide replaces Material Symbols Rounded as the iconography for the
design overhaul. Material Symbols remains imported until views are
migrated off it in later phases."
```

---

## Task 2: Add new color tokens to app.css

Add a new self-contained CSS block at the END of `:root` and `.dark` for the new token system. Do not edit any existing line.

**Files:**
- Modify: `src/renderer/app.css`

- [ ] **Step 1: Append new dark tokens after the `.dark` block**

Locate the closing `}` of the `.dark { ... }` block (around line 231). Insert this block immediately after it (before `.dark .label {` or whichever rule currently follows):

```css
/* === DESIGN OVERHAUL: NEW TOKEN SYSTEM ===
 * Additive layer. Coexists with legacy --background/--foreground/etc.
 * Consumed by new primitives in src/renderer/shared/components/ui/* and chrome/*.
 * Legacy variables remain in use by old components until per-view migration.
 */
:root {
  /* Dark surfaces — primary mode for the overhaul */
  --dp-bg-app: #0a0b0d;
  --dp-bg-chrome: #08090b;
  --dp-bg-elevated: #101216;
  --dp-bg-elevated-2: #14171c;
  --dp-border: #1c2026;
  --dp-border-soft: #16191e;

  /* Text */
  --dp-text: #e8eaed;
  --dp-text-dim: #9aa0a8;
  --dp-text-dimmer: #6b7280;

  /* Accent: Soft Violet */
  --dp-accent: #a78bfa;
  --dp-accent-soft: rgba(167, 139, 250, 0.12);
  --dp-accent-glow: rgba(167, 139, 250, 0.4);

  /* Signal colors */
  --dp-signal-ok: #4ade80;
  --dp-signal-warn: #fbbf24;
  --dp-signal-err: #f87171;
  --dp-signal-info: #60a5fa;

  /* Radius hierarchy */
  --dp-radius-xs: 3px;
  --dp-radius-sm: 5px;
  --dp-radius-md: 6px;
  --dp-radius-lg: 8px;
  --dp-radius-xl: 10px;
}

/* Light overrides — parallel map with reduced saturation, functional but un-hero'd */
:root:not(.dark) {
  --dp-bg-app: #fafaf9;
  --dp-bg-chrome: #f4f3ef;
  --dp-bg-elevated: #ffffff;
  --dp-bg-elevated-2: #f7f6f3;
  --dp-border: #e5e3de;
  --dp-border-soft: #ededea;
  --dp-text: #1a1c1f;
  --dp-text-dim: #555a62;
  --dp-text-dimmer: #8a8f96;
  --dp-accent: #7c5fe6;
  --dp-accent-soft: rgba(124, 95, 230, 0.10);
  --dp-accent-glow: rgba(124, 95, 230, 0.25);
  --dp-signal-ok: #16a34a;
  --dp-signal-warn: #ca8a04;
  --dp-signal-err: #dc2626;
  --dp-signal-info: #2563eb;
}
```

- [ ] **Step 2: Extend the existing `@theme` block to expose new tokens to Tailwind**

Locate the existing `@theme { ... }` block (lines 7-40). Add these lines BEFORE the closing `}`:

```css
  /* === DESIGN OVERHAUL: new token bindings === */
  --color-dp-bg-app: var(--dp-bg-app);
  --color-dp-bg-chrome: var(--dp-bg-chrome);
  --color-dp-bg-elevated: var(--dp-bg-elevated);
  --color-dp-bg-elevated-2: var(--dp-bg-elevated-2);
  --color-dp-border: var(--dp-border);
  --color-dp-border-soft: var(--dp-border-soft);
  --color-dp-text: var(--dp-text);
  --color-dp-text-dim: var(--dp-text-dim);
  --color-dp-text-dimmer: var(--dp-text-dimmer);
  --color-dp-accent: var(--dp-accent);
  --color-dp-accent-soft: var(--dp-accent-soft);
  --color-dp-signal-ok: var(--dp-signal-ok);
  --color-dp-signal-warn: var(--dp-signal-warn);
  --color-dp-signal-err: var(--dp-signal-err);
  --color-dp-signal-info: var(--dp-signal-info);

  --radius-dp-xs: var(--dp-radius-xs);
  --radius-dp-sm: var(--dp-radius-sm);
  --radius-dp-md: var(--dp-radius-md);
  --radius-dp-lg: var(--dp-radius-lg);
  --radius-dp-xl: var(--dp-radius-xl);
```

This makes utilities like `bg-dp-bg-elevated`, `text-dp-text-dim`, `border-dp-border`, `rounded-dp-lg` work out of the box in Tailwind 4 (CSS-first config — no `tailwind.config.ts` edits needed).

- [ ] **Step 3: Run dev build to verify CSS still compiles**

Run: `npm run dev` (or `pnpm dev`) and immediately Ctrl+C after the first build completes.

Expected: Vite logs "ready in Nms", no CSS errors, no "unknown utility" warnings. If errors, the most likely cause is a stray syntax issue in the inserted block — re-check the placement.

Alternative (non-blocking smoke test): `npm run build` and ensure it exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/app.css
git commit -m "feat(tokens): add design-overhaul token layer (--dp-*)

Adds dark + light parallel maps for the new Pro Console design system,
plus a radius hierarchy (xs/sm/md/lg/xl) — all under the --dp- prefix
to avoid colliding with legacy --background/--foreground/etc. tokens.
Exposed to Tailwind 4 via @theme so utilities like bg-dp-bg-elevated
work directly.

Additive only: no existing CSS changed. Phase 6 will rename --dp-* to
plain names after the legacy tokens are dropped."
```

---

## Task 3: Create centralized Lucide icon module

A single re-export file keeps icon usage consistent (same set, predictable bundle) and gives one place to swap an icon globally if needed.

**Files:**
- Create: `src/renderer/shared/lib/icons.ts`

- [ ] **Step 1: Create the icons module**

Write file `src/renderer/shared/lib/icons.ts`:

```ts
// Central icon module for the design overhaul.
// Import from here, not from "lucide-react" directly, so the icon set
// stays consistent and we have one place to swap an icon globally.

export {
  // Navigation
  LayoutGrid,
  Package,
  Play,
  ListOrdered,
  Settings,
  Bug,

  // Window chrome
  Sun,
  Moon,
  Monitor,
  Minus,
  Square,
  X,
  ChevronDown,
  ChevronUp,
  Check,

  // Status & feedback
  Circle,
  CircleDot,
  AlertTriangle,
  Info,

  // Actions
  Pause,
  RotateCw,
  Download,
  Upload,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  Search,
  Filter,

  // Domain
  User,
  Eye,
  Clock,
  Trophy,
  Gift,
  Sparkles,
  GripVertical,
} from "lucide-react";
```

- [ ] **Step 2: Verify import resolves**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "(icons.ts|lucide-react)" | head -5`

Expected: No errors mentioning either file. If lucide-react isn't found, re-run Task 1.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/shared/lib/icons.ts
git commit -m "feat(icons): add central Lucide icon re-export module

Single import surface so primitives and chrome components stay
consistent on icon set and a future global swap is one-file."
```

---

## Task 4: Create Logo component

The Droppilot brand mark: 16×16 SVG with a violet gradient square and a stylized arrow cutout (matches the mockup).

**Files:**
- Create: `src/renderer/shared/components/Logo.tsx`

- [ ] **Step 1: Create the Logo component**

Write file `src/renderer/shared/components/Logo.tsx`:

```tsx
import * as React from "react";
import { cn } from "@renderer/shared/lib/utils";

type LogoProps = React.SVGAttributes<SVGSVGElement> & {
  size?: number;
};

export const Logo = React.forwardRef<SVGSVGElement, LogoProps>(
  ({ className, size = 16, ...props }, ref) => (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("inline-block flex-shrink-0", className)}
      aria-label="Droppilot"
      {...props}
    >
      <defs>
        <linearGradient id="dp-logo-grad" x1="0" y1="0" x2="16" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--dp-accent)" />
          <stop offset="100%" stopColor="#7c5fe6" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="15" height="15" rx="3" fill="url(#dp-logo-grad)" />
      <rect x="0.5" y="0.5" width="15" height="15" rx="3" stroke="rgba(167,139,250,0.35)" strokeWidth="1" />
      <path
        d="M5.5 4.5 L5.5 11 M5.5 11 L11.5 11"
        stroke="#0a0b0d"
        strokeWidth="1.6"
        strokeLinecap="square"
        fill="none"
      />
      <path
        d="M5.5 11 L11.5 4.5"
        stroke="#0a0b0d"
        strokeWidth="1.6"
        strokeLinecap="square"
        fill="none"
      />
    </svg>
  ),
);
Logo.displayName = "Logo";
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "Logo.tsx" | head -5`

Expected: empty (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/shared/components/Logo.tsx
git commit -m "feat(brand): add Logo component for design overhaul

16x16 SVG brand mark — violet gradient square with arrow cutout.
Uses --dp-accent so it tracks theme tokens."
```

---

## Task 5: Extend Button primitive with new variants

Keep all existing variants (`default`, `secondary`, `outline`, `ghost`, `destructive`) and the existing `defaultVariants` to avoid breaking the 40+ button call sites in the codebase. Add four new variants prefixed with `dp-` and one new size.

**Files:**
- Modify: `src/renderer/shared/components/ui/button.tsx`

- [ ] **Step 1: Replace the file contents**

Write file `src/renderer/shared/components/ui/button.tsx`:

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@renderer/shared/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-background shadow-none hover:translate-y-0 hover:filter-none",
  {
    variants: {
      variant: {
        // === Legacy variants — DO NOT CHANGE, in use across the app ===
        default: "bg-foreground text-background hover:opacity-90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-muted",
        outline: "border border-border bg-transparent text-foreground hover:bg-muted",
        ghost: "bg-transparent text-foreground hover:bg-muted",
        destructive: "bg-destructive text-destructive-foreground hover:opacity-90",

        // === Design-overhaul variants (Pro Console palette) ===
        "dp-primary":
          "bg-[var(--dp-accent)] text-[#0a0b0d] font-semibold hover:bg-[#b89bff] rounded-[var(--dp-radius-sm)] font-mono tracking-[0.02em]",
        "dp-secondary":
          "bg-[var(--dp-bg-elevated)] text-[var(--dp-text)] border border-[var(--dp-border)] hover:bg-[var(--dp-bg-elevated-2)] hover:border-[var(--dp-accent-soft)] rounded-[var(--dp-radius-sm)] font-mono tracking-[0.02em]",
        "dp-outline":
          "bg-transparent text-[var(--dp-text)] border border-[var(--dp-border)] hover:bg-[var(--dp-bg-elevated)] hover:border-[color:var(--dp-accent-soft)] rounded-[var(--dp-radius-sm)] font-mono tracking-[0.02em]",
        "dp-ghost":
          "bg-transparent text-[var(--dp-text-dim)] hover:bg-[var(--dp-accent-soft)] hover:text-[var(--dp-accent)] rounded-[var(--dp-radius-sm)] font-mono tracking-[0.02em]",
      },
      size: {
        default: "h-9 px-3",
        sm: "h-8 px-2 text-xs",
        xs: "h-7 px-2 text-xs",
        // === Design-overhaul sizes ===
        "dp-sm": "h-7 px-2.5 text-[11px]",
        "dp-md": "h-8 px-3 text-[11px]",
        "dp-lg": "h-9 px-4 text-[12px]",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "button.tsx" | head -5`

Expected: empty.

- [ ] **Step 3: Smoke-test existing usages didn't break**

Run: `grep -rn "<Button" src/renderer --include="*.tsx" | wc -l`

Expected: a positive number (the same call sites as before). The default variant unchanged, so existing usage stays visually identical.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/shared/components/ui/button.tsx
git commit -m "feat(ui): extend Button with dp-* variants for design overhaul

Adds dp-primary / dp-secondary / dp-outline / dp-ghost variants and
dp-sm / dp-md / dp-lg sizes, all using the new --dp-* tokens.
Legacy variants and defaults unchanged so existing call sites render
identically."
```

---

## Task 6: Extend Badge primitive with new variants

**Files:**
- Modify: `src/renderer/shared/components/ui/badge.tsx`

- [ ] **Step 1: Replace the file contents**

Write file `src/renderer/shared/components/ui/badge.tsx`:

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@renderer/shared/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        // === Legacy ===
        default: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border bg-transparent text-foreground",
        muted: "border-border bg-muted text-muted-foreground",
        destructive: "border-destructive/30 bg-destructive/10 text-destructive",

        // === Design overhaul ===
        "dp-accent":
          "rounded-[var(--dp-radius-xs)] border-[color:var(--dp-accent-soft)] bg-[color:var(--dp-accent-soft)] text-[color:var(--dp-accent)] font-mono uppercase tracking-[0.08em] text-[10px] px-1.5 py-0.5",
        "dp-ok":
          "rounded-[var(--dp-radius-xs)] border-[rgba(74,222,128,0.18)] bg-[rgba(74,222,128,0.10)] text-[color:var(--dp-signal-ok)] font-mono uppercase tracking-[0.08em] text-[10px] px-1.5 py-0.5",
        "dp-warn":
          "rounded-[var(--dp-radius-xs)] border-[rgba(251,191,36,0.20)] bg-[rgba(251,191,36,0.10)] text-[color:var(--dp-signal-warn)] font-mono uppercase tracking-[0.08em] text-[10px] px-1.5 py-0.5",
        "dp-err":
          "rounded-[var(--dp-radius-xs)] border-[rgba(248,113,113,0.20)] bg-[rgba(248,113,113,0.10)] text-[color:var(--dp-signal-err)] font-mono uppercase tracking-[0.08em] text-[10px] px-1.5 py-0.5",
        "dp-info":
          "rounded-[var(--dp-radius-xs)] border-[rgba(96,165,250,0.20)] bg-[rgba(96,165,250,0.10)] text-[color:var(--dp-signal-info)] font-mono uppercase tracking-[0.08em] text-[10px] px-1.5 py-0.5",
        "dp-dim":
          "rounded-[var(--dp-radius-xs)] border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated-2)] text-[color:var(--dp-text-dim)] font-mono uppercase tracking-[0.08em] text-[10px] px-1.5 py-0.5",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "badge.tsx" | head -5`

Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/shared/components/ui/badge.tsx
git commit -m "feat(ui): add dp-* badge variants for signal pills

Six new variants matching the design-overhaul signal palette
(accent/ok/warn/err/info/dim). Legacy variants unchanged."
```

---

## Task 7: Extend Card primitive with CardAction

The existing Card/CardHeader/CardContent/etc. exports stay. Add a new `CardAction` slot for the right-aligned panel-action link pattern used in the Overview mockup ("manage →", "view all →").

**Files:**
- Modify: `src/renderer/shared/components/ui/card.tsx`

- [ ] **Step 1: Replace the file contents**

Write file `src/renderer/shared/components/ui/card.tsx`:

```tsx
import * as React from "react";
import { cn } from "@renderer/shared/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground shadow-sm",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col gap-1.5 p-4", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-base font-semibold leading-none", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-4 pt-0", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-4 pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

/**
 * CardAction — right-aligned action link slot for panel headers.
 * Used in the design-overhaul for "manage →", "view all →" type affordances.
 */
const CardAction = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        "ml-auto font-mono text-[10px] lowercase tracking-[0.04em] text-[color:var(--dp-text-dimmer)] transition-colors hover:text-[color:var(--dp-accent)]",
        className,
      )}
      {...props}
    />
  ),
);
CardAction.displayName = "CardAction";

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
};
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "card.tsx" | head -5`

Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/shared/components/ui/card.tsx
git commit -m "feat(ui): add CardAction slot for panel-header actions

Right-aligned link button used in the design-overhaul panel pattern
('manage →', 'view all →'). Other Card sub-components untouched."
```

---

## Task 8: Restyle Input primitive

Add a `dp` class layer to `<Input>` via a new optional `tone` prop. Keep the default rendering exactly as it was so existing forms don't shift.

**Files:**
- Modify: `src/renderer/shared/components/ui/input.tsx`

- [ ] **Step 1: Replace the file contents**

Write file `src/renderer/shared/components/ui/input.tsx`:

```tsx
import * as React from "react";
import { cn } from "@renderer/shared/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /** Visual treatment. `dp` applies the design-overhaul Pro Console styling. */
  tone?: "default" | "dp";
};

const TONE_CLASSES: Record<NonNullable<InputProps["tone"]>, string> = {
  default:
    "flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm text-foreground shadow-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
  dp:
    "flex h-8 w-full rounded-[var(--dp-radius-sm)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-3 py-1 font-mono text-[12px] text-[color:var(--dp-text)] shadow-none placeholder:text-[color:var(--dp-text-dimmer)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--dp-accent)] focus-visible:border-[color:var(--dp-accent)] transition-colors",
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, tone = "default", ...props }, ref) => (
    <input ref={ref} type={type} className={cn(TONE_CLASSES[tone], className)} {...props} />
  ),
);
Input.displayName = "Input";
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "input.tsx" | head -5`

Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/shared/components/ui/input.tsx
git commit -m "feat(ui): add Input tone='dp' for design overhaul

Optional Pro Console treatment (mono text, --dp-* tokens, violet
focus ring). Default tone unchanged."
```

---

## Task 9: Restyle Select primitive trigger

Same approach as Input: optional `tone` prop on SelectTrigger. Items and content keep their existing styling for now (they get a closer look during Phase 5 Settings work).

**Files:**
- Modify: `src/renderer/shared/components/ui/select.tsx`

- [ ] **Step 1: Update SelectTrigger to accept a tone prop**

Find the `SelectTrigger` definition (lines 54-72). Replace it with:

```tsx
type SelectTriggerProps = React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & {
  tone?: "default" | "dp";
};

const TRIGGER_TONE: Record<NonNullable<SelectTriggerProps["tone"]>, string> = {
  default:
    "select inline-flex items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-none ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground [&>span]:line-clamp-1",
  dp:
    "inline-flex h-8 items-center justify-between gap-2 rounded-[var(--dp-radius-sm)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-3 py-1 font-mono text-[12px] text-[color:var(--dp-text)] shadow-none placeholder:text-[color:var(--dp-text-dimmer)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--dp-accent)] focus-visible:border-[color:var(--dp-accent)] disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-[color:var(--dp-text-dimmer)] [&>span]:line-clamp-1 transition-colors",
};

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  SelectTriggerProps
>(({ className, children, tone = "default", ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(TRIGGER_TONE[tone], className)}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDownIcon className="opacity-60" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;
```

Leave all other exports (`SelectContent`, `SelectItem`, etc.) untouched.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "select.tsx" | head -5`

Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/shared/components/ui/select.tsx
git commit -m "feat(ui): add SelectTrigger tone='dp' for design overhaul

Same pattern as Input — optional Pro Console treatment via tone prop.
SelectContent/Item styling deferred to Phase 5 Settings work."
```

---

## Task 10: Create Pill primitive

Compact status pill with leading dot. Distinct from Badge because it carries a live status connotation and supports a colored dot prefix.

**Files:**
- Create: `src/renderer/shared/components/ui/pill.tsx`

- [ ] **Step 1: Create the file**

Write file `src/renderer/shared/components/ui/pill.tsx`:

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@renderer/shared/lib/utils";

const pillVariants = cva(
  "inline-flex items-center gap-1.5 rounded-[var(--dp-radius-xs)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] border",
  {
    variants: {
      tone: {
        accent: "bg-[color:var(--dp-accent-soft)] text-[color:var(--dp-accent)] border-[color:var(--dp-accent-soft)]",
        ok: "bg-[rgba(74,222,128,0.08)] text-[color:var(--dp-signal-ok)] border-[rgba(74,222,128,0.18)]",
        warn: "bg-[rgba(251,191,36,0.08)] text-[color:var(--dp-signal-warn)] border-[rgba(251,191,36,0.18)]",
        err: "bg-[rgba(248,113,113,0.08)] text-[color:var(--dp-signal-err)] border-[rgba(248,113,113,0.18)]",
        info: "bg-[rgba(96,165,250,0.08)] text-[color:var(--dp-signal-info)] border-[rgba(96,165,250,0.18)]",
        dim: "bg-[rgba(154,160,168,0.06)] text-[color:var(--dp-text-dim)] border-[rgba(154,160,168,0.12)]",
      },
    },
    defaultVariants: { tone: "dim" },
  },
);

export type PillProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof pillVariants> & {
    /** Render a leading status dot (with currentColor + glow). */
    dot?: boolean;
  };

export const Pill = React.forwardRef<HTMLSpanElement, PillProps>(
  ({ className, tone, dot, children, ...props }, ref) => (
    <span ref={ref} className={cn(pillVariants({ tone }), className)} {...props}>
      {dot && (
        <span
          aria-hidden="true"
          className="inline-block h-[5px] w-[5px] rounded-full bg-current"
          style={{ boxShadow: "0 0 6px currentColor" }}
        />
      )}
      {children}
    </span>
  ),
);
Pill.displayName = "Pill";
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "pill.tsx" | head -5`

Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/shared/components/ui/pill.tsx
git commit -m "feat(ui): add Pill primitive for status indicators

Compact mono pill (accent/ok/warn/err/info/dim) with optional leading
dot that picks up currentColor + glow."
```

---

## Task 11: Create SectionLabel primitive

Mono uppercase eyebrow with trailing 1px rule — used to head every panel/section in the new design.

**Files:**
- Create: `src/renderer/shared/components/ui/section-label.tsx`

- [ ] **Step 1: Create the file**

Write file `src/renderer/shared/components/ui/section-label.tsx`:

```tsx
import * as React from "react";
import { cn } from "@renderer/shared/lib/utils";

export type SectionLabelProps = React.HTMLAttributes<HTMLDivElement> & {
  /** If true, omits the trailing 1px rule (useful inside panel headers). */
  inline?: boolean;
};

export const SectionLabel = React.forwardRef<HTMLDivElement, SectionLabelProps>(
  ({ className, inline, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--dp-text-dimmer)]",
        className,
      )}
      {...props}
    >
      <span>{children}</span>
      {!inline && (
        <span
          aria-hidden="true"
          className="h-px flex-1 bg-[color:var(--dp-border)]"
        />
      )}
    </div>
  ),
);
SectionLabel.displayName = "SectionLabel";
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "section-label" | head -5`

Expected: empty.

```bash
git add src/renderer/shared/components/ui/section-label.tsx
git commit -m "feat(ui): add SectionLabel primitive

Mono uppercase eyebrow with trailing 1px rule. Used to head every
panel/section in the design overhaul; pass inline to drop the rule."
```

---

## Task 12: Create Stat primitive

Label/value/sub triplet for the hero stat-grid pattern.

**Files:**
- Create: `src/renderer/shared/components/ui/stat.tsx`

- [ ] **Step 1: Create the file**

Write file `src/renderer/shared/components/ui/stat.tsx`:

```tsx
import * as React from "react";
import { cn } from "@renderer/shared/lib/utils";

export type StatProps = React.HTMLAttributes<HTMLDivElement> & {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  /** Apply the accent color to the value. */
  accent?: boolean;
  /** Sub-line semantic tone — picks the right signal color. */
  subTone?: "default" | "ok" | "warn" | "err";
};

const SUB_TONE: Record<NonNullable<StatProps["subTone"]>, string> = {
  default: "text-[color:var(--dp-text-dimmer)]",
  ok: "text-[color:var(--dp-signal-ok)]",
  warn: "text-[color:var(--dp-signal-warn)]",
  err: "text-[color:var(--dp-signal-err)]",
};

export const Stat = React.forwardRef<HTMLDivElement, StatProps>(
  ({ className, label, value, sub, accent, subTone = "default", children, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col", className)} {...props}>
      <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--dp-text-dimmer)]">
        {label}
      </div>
      <div
        className={cn(
          "font-mono text-[22px] font-medium leading-none tracking-[-0.01em]",
          accent ? "text-[color:var(--dp-accent)]" : "text-[color:var(--dp-text)]",
        )}
        style={{ fontFeatureSettings: '"tnum"' }}
      >
        {value}
      </div>
      {sub != null && (
        <div className={cn("mt-1 font-mono text-[10px]", SUB_TONE[subTone])}>
          {sub}
        </div>
      )}
      {children}
    </div>
  ),
);
Stat.displayName = "Stat";
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "stat.tsx" | head -5`

Expected: empty.

```bash
git add src/renderer/shared/components/ui/stat.tsx
git commit -m "feat(ui): add Stat primitive for hero stat-grids

label/value/sub triplet with optional accent on value and signal
tones on sub. Numeric uses font-feature-settings: tnum to prevent
layout shift on live updates."
```

---

## Task 13: Create FeedItem primitive

For the activity-feed sidecard. Icon badge + msg + meta line.

**Files:**
- Create: `src/renderer/shared/components/ui/feed-item.tsx`

- [ ] **Step 1: Create the file**

Write file `src/renderer/shared/components/ui/feed-item.tsx`:

```tsx
import * as React from "react";
import { cn } from "@renderer/shared/lib/utils";

export type FeedItemTone = "ok" | "warn" | "err" | "info" | "accent";

export type FeedItemProps = React.HTMLAttributes<HTMLDivElement> & {
  tone?: FeedItemTone;
  icon: React.ReactNode;
  msg: React.ReactNode;
  meta?: React.ReactNode;
  /** Drops the divider that would normally appear under this item. */
  last?: boolean;
};

const ICON_TONE: Record<FeedItemTone, string> = {
  ok: "bg-[rgba(74,222,128,0.10)] text-[color:var(--dp-signal-ok)]",
  warn: "bg-[rgba(251,191,36,0.10)] text-[color:var(--dp-signal-warn)]",
  err: "bg-[rgba(248,113,113,0.10)] text-[color:var(--dp-signal-err)]",
  info: "bg-[rgba(96,165,250,0.10)] text-[color:var(--dp-signal-info)]",
  accent: "bg-[color:var(--dp-accent-soft)] text-[color:var(--dp-accent)]",
};

export const FeedItem = React.forwardRef<HTMLDivElement, FeedItemProps>(
  ({ className, tone = "info", icon, msg, meta, last, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-start gap-2.5 py-2.5",
        !last && "border-b border-[color:var(--dp-border-soft)]",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-[var(--dp-radius-xs)] [&>svg]:h-[11px] [&>svg]:w-[11px]",
          ICON_TONE[tone],
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] leading-snug text-[color:var(--dp-text)]">{msg}</div>
        {meta != null && (
          <div className="mt-1 font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
            {meta}
          </div>
        )}
      </div>
    </div>
  ),
);
FeedItem.displayName = "FeedItem";
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "feed-item" | head -5`

Expected: empty.

```bash
git add src/renderer/shared/components/ui/feed-item.tsx
git commit -m "feat(ui): add FeedItem primitive for activity feeds

Icon-badge + msg + meta layout with tone variants for status semantic.
Last={true} drops the divider for the bottom item in a list."
```

---

## Task 14: Create Table primitive

Lightweight, grid-based data table — not a sortable/headless implementation, just the visual primitive (Head, Row, Cell) that consumes a `columns` template. Sort/filter/keyboard nav live with the consumer in Phase 3.

**Files:**
- Create: `src/renderer/shared/components/ui/table.tsx`

- [ ] **Step 1: Create the file**

Write file `src/renderer/shared/components/ui/table.tsx`:

```tsx
import * as React from "react";
import { cn } from "@renderer/shared/lib/utils";

/**
 * Table primitives use CSS grid for column alignment so consumers can
 * pass any `gridTemplateColumns` template (e.g. "36px 1fr 100px 80px").
 * Rows and head share the same template via a context.
 */
type TableContextValue = { columns: string };
const TableContext = React.createContext<TableContextValue | null>(null);

function useTableColumns(component: string): string {
  const ctx = React.useContext(TableContext);
  if (!ctx) {
    throw new Error(`${component} must be used inside <Table>`);
  }
  return ctx.columns;
}

export type TableProps = React.HTMLAttributes<HTMLDivElement> & {
  /** CSS grid-template-columns value, e.g. "36px 2fr 1fr 1fr 100px". */
  columns: string;
  /** Visual density. */
  density?: "dense" | "comfortable";
};

export const Table = React.forwardRef<HTMLDivElement, TableProps>(
  ({ className, columns, density: _density = "dense", children, ...props }, ref) => (
    <TableContext.Provider value={{ columns }}>
      <div
        ref={ref}
        role="table"
        className={cn("w-full text-[13px]", className)}
        {...props}
      >
        {children}
      </div>
    </TableContext.Provider>
  ),
);
Table.displayName = "Table";

export const TableHead = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const columns = useTableColumns("TableHead");
    return (
      <div
        ref={ref}
        role="row"
        className={cn(
          "grid h-8 items-center gap-4 border-b border-[color:var(--dp-border-soft)] px-5 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--dp-text-dimmer)]",
          className,
        )}
        style={{ gridTemplateColumns: columns }}
        {...props}
      >
        {children}
      </div>
    );
  },
);
TableHead.displayName = "TableHead";

export type TableRowProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Renders the row as a button-like clickable element. */
  interactive?: boolean;
};

export const TableRow = React.forwardRef<HTMLDivElement, TableRowProps>(
  ({ className, interactive, children, ...props }, ref) => {
    const columns = useTableColumns("TableRow");
    return (
      <div
        ref={ref}
        role="row"
        className={cn(
          "grid h-[52px] items-center gap-4 border-b border-[color:var(--dp-border-soft)] px-5 transition-colors last:border-b-0",
          interactive && "cursor-pointer hover:bg-[color:var(--dp-bg-elevated-2)]",
          className,
        )}
        style={{ gridTemplateColumns: columns }}
        {...props}
      >
        {children}
      </div>
    );
  },
);
TableRow.displayName = "TableRow";

export type TableCellProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Apply mono numeric/data styling. */
  mono?: boolean;
  /** Dim the value (used for "—" / empty / placeholder cells). */
  dim?: boolean;
};

export const TableCell = React.forwardRef<HTMLDivElement, TableCellProps>(
  ({ className, mono, dim, children, ...props }, ref) => (
    <div
      ref={ref}
      role="cell"
      className={cn(
        "min-w-0 truncate",
        mono && "font-mono text-[12px]",
        dim && "text-[color:var(--dp-text-dim)]",
        !dim && !mono && "text-[color:var(--dp-text)]",
        mono && !dim && "text-[color:var(--dp-text)]",
        className,
      )}
      style={mono ? { fontFeatureSettings: '"tnum"' } : undefined}
      {...props}
    >
      {children}
    </div>
  ),
);
TableCell.displayName = "TableCell";
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "table.tsx" | head -5`

Expected: empty.

```bash
git add src/renderer/shared/components/ui/table.tsx
git commit -m "feat(ui): add Table primitive (grid-based, density-aware)

Visual-only primitive: Table provides a column template via context,
TableHead/Row/Cell consume it. Consumers wire sort/filter/keyboard
themselves (Phase 3 Inventory). interactive flag adds hover affordance,
mono flag applies tnum + Plex Mono."
```

---

## Task 15: Create chrome/Titlebar (new, additive)

This is a NEW component at a new path. It does not replace the existing `TitleBar` yet — that switch happens in Phase 2. Built so that Phase 2 can drop it into `App.tsx` with a 1-line change.

**Files:**
- Create: `src/renderer/shared/components/chrome/Titlebar.tsx`

- [ ] **Step 1: Create the file**

Write file `src/renderer/shared/components/chrome/Titlebar.tsx`:

```tsx
import * as React from "react";
import { Logo } from "@renderer/shared/components/Logo";
import { Pill } from "@renderer/shared/components/ui/pill";
import { Sun, Moon, Settings, Minus, Square, X } from "@renderer/shared/lib/icons";
import { cn } from "@renderer/shared/lib/utils";

export type TitlebarTheme = "light" | "dark";

export type TitlebarProps = {
  title?: string;
  version?: string;
  theme: TitlebarTheme;
  onThemeToggle: () => void;
  onSettingsClick?: () => void;

  /** Connection / API status pills shown center-right. */
  connectionState?: "connected" | "disconnected" | "connecting";
  apiLatencyMs?: number;

  /** Window action handler (null = Windows-native chrome handled elsewhere). */
  onWindowAction?: (action: "minimize" | "maximize" | "close") => void;
  className?: string;
};

export function Titlebar({
  title = "droppilot",
  version,
  theme,
  onThemeToggle,
  onSettingsClick,
  connectionState,
  apiLatencyMs,
  onWindowAction,
  className,
}: TitlebarProps) {
  return (
    <div
      className={cn(
        "flex h-9 items-center gap-3.5 border-b border-[color:var(--dp-border)] bg-[color:var(--dp-bg-chrome)] px-3.5",
        "app-drag",
        className,
      )}
    >
      {/* Brand */}
      <div className="flex items-center gap-2">
        <Logo size={14} />
        <span className="font-mono text-[11px] font-semibold tracking-[0.04em] text-[color:var(--dp-text)]">
          {title}
        </span>
        {version && (
          <>
            <span className="text-[color:var(--dp-text-dimmer)] opacity-40">·</span>
            <span className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
              v{version}
            </span>
          </>
        )}
      </div>

      {/* Center/right status */}
      <div className="ml-auto flex items-center gap-3" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        {connectionState && (
          <Pill tone={connectionState === "connected" ? "ok" : connectionState === "connecting" ? "warn" : "err"} dot>
            {connectionState}
          </Pill>
        )}
        {typeof apiLatencyMs === "number" && (
          <Pill tone="dim">api {apiLatencyMs}ms</Pill>
        )}

        {/* Icon actions */}
        <button
          type="button"
          onClick={onThemeToggle}
          aria-label={`Toggle theme (current: ${theme})`}
          className="flex h-[22px] w-[22px] items-center justify-center rounded-[var(--dp-radius-xs)] text-[color:var(--dp-text-dimmer)] transition-colors hover:bg-[color:var(--dp-bg-elevated)] hover:text-[color:var(--dp-text)]"
        >
          {theme === "dark" ? <Moon size={13} strokeWidth={1.7} /> : <Sun size={13} strokeWidth={1.7} />}
        </button>
        {onSettingsClick && (
          <button
            type="button"
            onClick={onSettingsClick}
            aria-label="Open settings"
            className="flex h-[22px] w-[22px] items-center justify-center rounded-[var(--dp-radius-xs)] text-[color:var(--dp-text-dimmer)] transition-colors hover:bg-[color:var(--dp-bg-elevated)] hover:text-[color:var(--dp-text)]"
          >
            <Settings size={13} strokeWidth={1.7} />
          </button>
        )}

        {/* Native-feeling Windows controls (only render when handler provided) */}
        {onWindowAction && (
          <div className="ml-1 flex items-center">
            <button
              type="button"
              onClick={() => onWindowAction("minimize")}
              aria-label="Minimize"
              className="flex h-9 w-11 items-center justify-center text-[color:var(--dp-text-dim)] transition-colors hover:bg-[color:var(--dp-bg-elevated)]"
            >
              <Minus size={14} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={() => onWindowAction("maximize")}
              aria-label="Maximize"
              className="flex h-9 w-11 items-center justify-center text-[color:var(--dp-text-dim)] transition-colors hover:bg-[color:var(--dp-bg-elevated)]"
            >
              <Square size={12} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={() => onWindowAction("close")}
              aria-label="Close"
              className="flex h-9 w-11 items-center justify-center text-[color:var(--dp-text-dim)] transition-colors hover:bg-[#dc2626] hover:text-white"
            >
              <X size={14} strokeWidth={1.5} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "Titlebar.tsx" | head -5`

Expected: empty.

```bash
git add src/renderer/shared/components/chrome/Titlebar.tsx
git commit -m "feat(chrome): add Titlebar component (additive, not wired)

New 36px titlebar — Logo + wordmark + version, status pills, theme
toggle, settings icon, Windows-style min/max/close. Lives at the new
chrome/ path; App.tsx still uses the old TitleBar until Phase 2 swap."
```

---

## Task 16: Create chrome/AppNav (new top-nav)

Named `AppNav` (not `TopNav`) to avoid collision with the existing `TopNav` component. Phase 2 will swap `AppContent` to use this and the old `TopNav` can be deleted.

**Files:**
- Create: `src/renderer/shared/components/chrome/AppNav.tsx`

- [ ] **Step 1: Create the file**

Write file `src/renderer/shared/components/chrome/AppNav.tsx`:

```tsx
import * as React from "react";
import {
  LayoutGrid,
  Package,
  Play,
  ListOrdered,
  Settings,
  Bug,
} from "@renderer/shared/lib/icons";
import { cn } from "@renderer/shared/lib/utils";

export type AppNavView = "overview" | "inventory" | "control" | "priorities" | "settings" | "debug";

const ICON_MAP: Record<AppNavView, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  overview: LayoutGrid,
  inventory: Package,
  control: Play,
  priorities: ListOrdered,
  settings: Settings,
  debug: Bug,
};

export type AppNavItem = {
  key: AppNavView;
  label: string;
};

export type AppNavProps = {
  view: AppNavView;
  onChange: (next: AppNavView) => void;
  items: AppNavItem[];
  /** Right slot — session chip, user info, anything. */
  right?: React.ReactNode;
  className?: string;
};

export function AppNav({ view, onChange, items, right, className }: AppNavProps) {
  return (
    <nav
      aria-label="Primary"
      className={cn(
        "flex h-[42px] items-stretch border-b border-[color:var(--dp-border)] bg-[color:var(--dp-bg-app)] px-3.5",
        className,
      )}
    >
      {items.map((item) => {
        const Icon = ICON_MAP[item.key];
        const active = item.key === view;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-[7px] px-3.5 font-mono text-[11px] lowercase tracking-[0.04em] transition-colors",
              active
                ? "text-[color:var(--dp-text)]"
                : "text-[color:var(--dp-text-dimmer)] hover:text-[color:var(--dp-text-dim)]",
            )}
          >
            <Icon size={13} strokeWidth={1.7} className="opacity-85" />
            {item.label}
            {active && (
              <span
                aria-hidden="true"
                className="absolute inset-x-3.5 -bottom-px h-px bg-[color:var(--dp-accent)]"
                style={{ boxShadow: "0 0 8px var(--dp-accent-glow)" }}
              />
            )}
          </button>
        );
      })}
      {right && (
        <div className="ml-auto flex items-center gap-2.5 pr-1 font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
          {right}
        </div>
      )}
    </nav>
  );
}
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "AppNav.tsx" | head -5`

Expected: empty.

```bash
git add src/renderer/shared/components/chrome/AppNav.tsx
git commit -m "feat(chrome): add AppNav component (new 42px top nav)

Replaces TopNav design with mono lowercase labels, Lucide icons,
violet underline + glow for active state, right-slot for session
indicator. Additive; old TopNav stays until Phase 2 swap."
```

---

## Task 17: Create chrome/Statusbar

**Files:**
- Create: `src/renderer/shared/components/chrome/Statusbar.tsx`

- [ ] **Step 1: Create the file**

Write file `src/renderer/shared/components/chrome/Statusbar.tsx`:

```tsx
import * as React from "react";
import { cn } from "@renderer/shared/lib/utils";

export type StatusbarTone = "ok" | "warn" | "err" | "info" | "dim";

export type StatusbarItem = {
  label: React.ReactNode;
  /** Leading dot color (omit for none). */
  tone?: StatusbarTone;
};

export type StatusbarProps = {
  left?: StatusbarItem[];
  right?: StatusbarItem[];
  className?: string;
};

const TONE_COLOR: Record<StatusbarTone, string> = {
  ok: "var(--dp-signal-ok)",
  warn: "var(--dp-signal-warn)",
  err: "var(--dp-signal-err)",
  info: "var(--dp-signal-info)",
  dim: "var(--dp-text-dimmer)",
};

function renderItems(items: StatusbarItem[] | undefined) {
  if (!items || items.length === 0) return null;
  return items.map((item, i) => (
    <React.Fragment key={i}>
      {i > 0 && <span className="text-[color:var(--dp-border)]" aria-hidden="true">│</span>}
      <span className="flex items-center gap-1.5">
        {item.tone && (
          <span
            aria-hidden="true"
            className="inline-block h-[5px] w-[5px] rounded-full"
            style={{ background: TONE_COLOR[item.tone] }}
          />
        )}
        <span>{item.label}</span>
      </span>
    </React.Fragment>
  ));
}

export function Statusbar({ left, right, className }: StatusbarProps) {
  return (
    <div
      className={cn(
        "flex h-[26px] items-center gap-4 border-t border-[color:var(--dp-border)] bg-[color:var(--dp-bg-chrome)] px-4 font-mono text-[10px] text-[color:var(--dp-text-dimmer)]",
        className,
      )}
    >
      {renderItems(left)}
      {right && (
        <div className="ml-auto flex items-center gap-3.5">
          {renderItems(right)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "Statusbar.tsx" | head -5`

Expected: empty.

```bash
git add src/renderer/shared/components/chrome/Statusbar.tsx
git commit -m "feat(chrome): add Statusbar component

26px bottom bar with left/right item slots, tone-colored leading dots,
mono 10px text. Engine state / cadence / metrics rendering."
```

---

## Task 18: Add chrome barrel export

**Files:**
- Create: `src/renderer/shared/components/chrome/index.ts`

- [ ] **Step 1: Create the file**

Write file `src/renderer/shared/components/chrome/index.ts`:

```ts
export { Titlebar } from "./Titlebar";
export type { TitlebarProps, TitlebarTheme } from "./Titlebar";

export { AppNav } from "./AppNav";
export type { AppNavProps, AppNavItem, AppNavView } from "./AppNav";

export { Statusbar } from "./Statusbar";
export type { StatusbarProps, StatusbarItem, StatusbarTone } from "./Statusbar";
```

- [ ] **Step 2: Type-check + commit**

```bash
git add src/renderer/shared/components/chrome/index.ts
git commit -m "chore(chrome): add barrel export for chrome components"
```

---

## Task 19: Create DevPrimitives showcase view

A single view that renders every new primitive + chrome component, in both inline and panel contexts, so we can eyeball them in light + dark without spinning up real data.

**Files:**
- Create: `src/renderer/features/dev-primitives/DevPrimitivesView.tsx`
- Create: `src/renderer/features/dev-primitives/index.ts`

- [ ] **Step 1: Create the showcase view**

Write file `src/renderer/features/dev-primitives/DevPrimitivesView.tsx`:

```tsx
import * as React from "react";
import { Button } from "@renderer/shared/components/ui/button";
import { Badge } from "@renderer/shared/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardAction,
} from "@renderer/shared/components/ui/card";
import { Input } from "@renderer/shared/components/ui/input";
import { Pill } from "@renderer/shared/components/ui/pill";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { Stat } from "@renderer/shared/components/ui/stat";
import { FeedItem } from "@renderer/shared/components/ui/feed-item";
import { Table, TableHead, TableRow, TableCell } from "@renderer/shared/components/ui/table";
import { Titlebar } from "@renderer/shared/components/chrome/Titlebar";
import { AppNav, type AppNavView } from "@renderer/shared/components/chrome/AppNav";
import { Statusbar } from "@renderer/shared/components/chrome/Statusbar";
import { Logo } from "@renderer/shared/components/Logo";
import {
  Check,
  RotateCw,
  AlertTriangle,
  Pause,
  ArrowRight,
} from "@renderer/shared/lib/icons";

export function DevPrimitivesView() {
  const [theme, setTheme] = React.useState<"light" | "dark">(
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
      ? "dark"
      : "light",
  );
  const [view, setView] = React.useState<AppNavView>("overview");

  const toggleTheme = React.useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      return next;
    });
  }, []);

  return (
    <div
      className="min-h-screen w-full"
      style={{
        background: "var(--dp-bg-app)",
        color: "var(--dp-text)",
      }}
    >
      {/* Chrome stack at the top */}
      <Titlebar
        version="2.5.7"
        theme={theme}
        onThemeToggle={toggleTheme}
        onSettingsClick={() => {}}
        connectionState="connected"
        apiLatencyMs={124}
        onWindowAction={(a) => console.log("window:", a)}
      />
      <AppNav
        view={view}
        onChange={setView}
        items={[
          { key: "overview", label: "overview" },
          { key: "inventory", label: "inventory" },
          { key: "control", label: "control" },
          { key: "priorities", label: "priorities" },
          { key: "settings", label: "settings" },
          { key: "debug", label: "debug" },
        ]}
        right={
          <>
            <span>shroud</span>
            <span style={{ color: "var(--dp-accent)" }}>●</span>
            <span>logged in</span>
          </>
        }
      />

      <div className="px-8 py-8 space-y-12 max-w-[1100px] mx-auto">
        <header className="flex items-center gap-3">
          <Logo size={20} />
          <h1 className="font-mono text-[14px] uppercase tracking-[0.14em] text-[color:var(--dp-text-dimmer)]">
            Design Overhaul · Primitives Showcase
          </h1>
        </header>

        {/* Buttons */}
        <section>
          <SectionLabel>buttons</SectionLabel>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="dp-primary" size="dp-md">claim now</Button>
            <Button variant="dp-secondary" size="dp-md"><Pause size={11} strokeWidth={1.8} /> pause</Button>
            <Button variant="dp-outline" size="dp-md"><RotateCw size={11} strokeWidth={1.8} /> switch target</Button>
            <Button variant="dp-ghost" size="dp-md">cancel</Button>
            <Button variant="dp-primary" size="dp-sm">sm</Button>
            <Button variant="dp-primary" size="dp-lg">lg</Button>
          </div>
        </section>

        {/* Pills & Badges */}
        <section>
          <SectionLabel>pills · badges</SectionLabel>
          <div className="mt-3 flex flex-wrap gap-2">
            <Pill tone="accent" dot>live</Pill>
            <Pill tone="ok" dot>connected</Pill>
            <Pill tone="warn" dot>retrying</Pill>
            <Pill tone="err" dot>failed</Pill>
            <Pill tone="info">api ok · 124ms</Pill>
            <Pill tone="dim">queued</Pill>
            <Badge variant="dp-accent">accent</Badge>
            <Badge variant="dp-ok">ok</Badge>
            <Badge variant="dp-warn">warn</Badge>
            <Badge variant="dp-err">err</Badge>
            <Badge variant="dp-info">info</Badge>
            <Badge variant="dp-dim">dim</Badge>
          </div>
        </section>

        {/* Inputs */}
        <section>
          <SectionLabel>inputs</SectionLabel>
          <div className="mt-3 flex max-w-md flex-col gap-2">
            <Input tone="dp" placeholder="search drops…" />
            <Input tone="dp" placeholder="username" defaultValue="shroud" />
          </div>
        </section>

        {/* Stat grid */}
        <section>
          <SectionLabel>stat grid</SectionLabel>
          <div
            className="mt-3 grid gap-0 rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] p-6"
            style={{ gridTemplateColumns: "1.4fr 1fr 1fr 1fr" }}
          >
            <Stat label="eta" value="02:14:38" sub="87% complete" accent />
            <Stat label="viewers" value="14,247" sub="+1.2K · 5m" subTone="warn" />
            <Stat label="next claim" value="02:14h" sub="auto-claim on" subTone="ok" />
            <Stat label="session" value="04:32:12" sub="3 drops earned" />
          </div>
        </section>

        {/* Card with panel-header pattern */}
        <section>
          <SectionLabel>card · panel pattern</SectionLabel>
          <Card className="mt-3 bg-[color:var(--dp-bg-elevated)] border-[color:var(--dp-border)] rounded-[var(--dp-radius-lg)]">
            <CardHeader className="flex flex-row items-center border-b border-[color:var(--dp-border-soft)] py-3.5">
              <CardTitle className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--dp-text-dim)] font-normal">
                queue · next up
              </CardTitle>
              <CardAction>manage →</CardAction>
            </CardHeader>
            <CardContent className="p-0">
              <Table columns="40px 2fr 1.2fr 0.8fr 0.8fr 0.8fr">
                <TableHead>
                  <span>#</span>
                  <span>game · channel</span>
                  <span>drop</span>
                  <span>eta</span>
                  <span>viewers</span>
                  <span>status</span>
                </TableHead>
                <TableRow interactive>
                  <TableCell mono dim>02</TableCell>
                  <TableCell>
                    Counter-Strike 2
                    <div className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)] mt-0.5">s1mple</div>
                  </TableCell>
                  <TableCell>Major Sticker</TableCell>
                  <TableCell mono dim>04:00h</TableCell>
                  <TableCell mono dim>8.4K</TableCell>
                  <TableCell><Pill tone="dim">queued</Pill></TableCell>
                </TableRow>
                <TableRow interactive>
                  <TableCell mono dim>03</TableCell>
                  <TableCell>
                    Apex Legends
                    <div className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)] mt-0.5">timthetatman</div>
                  </TableCell>
                  <TableCell>Charge Rifle Skin</TableCell>
                  <TableCell mono dim>06:30h</TableCell>
                  <TableCell mono dim>12.1K</TableCell>
                  <TableCell><Pill tone="dim">queued</Pill></TableCell>
                </TableRow>
              </Table>
            </CardContent>
          </Card>
        </section>

        {/* Feed */}
        <section>
          <SectionLabel>activity feed</SectionLabel>
          <div className="mt-3 max-w-md rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-4">
            <FeedItem
              tone="ok"
              icon={<Check />}
              msg={<>Claimed <strong>Rivals Banner</strong></>}
              meta={<>rust · 12 min ago</>}
            />
            <FeedItem
              tone="info"
              icon={<RotateCw />}
              msg={<>Switched to <strong>shroud</strong></>}
              meta={<>rust · 38 min ago</>}
            />
            <FeedItem
              tone="warn"
              icon={<AlertTriangle />}
              msg="No progress · probe recovery"
              meta={<>apex · 2h ago</>}
              last
            />
          </div>
        </section>
      </div>

      <Statusbar
        left={[
          { tone: "ok", label: "engine: running" },
          { label: "watch.cycle 30s" },
          { label: "3 drops · today" },
        ]}
        right={[
          { label: "cpu 2.1%" },
          { label: "mem 142mb" },
          { label: <span style={{ color: "var(--dp-accent)" }}>⌘K</span> },
        ]}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create the barrel export**

Write file `src/renderer/features/dev-primitives/index.ts`:

```ts
export { DevPrimitivesView } from "./DevPrimitivesView";
```

- [ ] **Step 3: Type-check + commit**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "dev-primitives" | head -5`

Expected: empty.

```bash
git add src/renderer/features/dev-primitives/
git commit -m "feat(dev): add /dev-primitives showcase view

Renders every new primitive and chrome component in one place for
visual QA. Wired in next task — accessible via #dev-primitives hash
in dev mode."
```

---

## Task 20: Wire DevPrimitivesView into App.tsx as a dev-only route

This is a 1-block insertion at the top of the existing `App()` function. No View type changes, no nav wiring. The existing app rendering is unchanged when the URL hash is not `#dev-primitives`.

**Files:**
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Add the hash check**

Read the current `App.tsx`. Replace the file contents with:

```tsx
import { AppContent, Hero, TitleBar, UpdateOverlay } from "@renderer/shared/components";
import { useAppModel } from "@renderer/shared/hooks";
import { I18nProvider } from "@renderer/shared/i18n";
import { DevPrimitivesView } from "@renderer/features/dev-primitives";

function App() {
  const {
    language,
    isMac,
    heroProps,
    titleBarProps,
    updateOverlayProps,
    navProps,
    overviewProps,
    inventoryProps,
    priorityProps,
    settingsProps,
    controlProps,
    debugSnapshot,
    debugEnabled,
  } = useAppModel();

  // Dev-only primitives showcase. Open with #dev-primitives in the URL.
  // Lives outside the normal View enum so it never appears in the nav
  // or i18n tables — it is purely for engineering preview.
  if (import.meta.env.DEV && typeof window !== "undefined" && window.location.hash === "#dev-primitives") {
    return (
      <I18nProvider language={language}>
        <DevPrimitivesView />
      </I18nProvider>
    );
  }

  return (
    <I18nProvider language={language}>
      <div className="window-shell">
        {!isMac && <TitleBar {...titleBarProps} />}
        <UpdateOverlay {...updateOverlayProps} />
        <div className="app-shell">
          <Hero {...heroProps} />

          <AppContent
            navProps={navProps}
            overviewProps={overviewProps}
            inventoryProps={inventoryProps}
            priorityProps={priorityProps}
            settingsProps={settingsProps}
            controlProps={controlProps}
            debugSnapshot={debugSnapshot}
            debugEnabled={debugEnabled}
          />
        </div>
      </div>
    </I18nProvider>
  );
}

export default App;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "App.tsx" | head -5`

Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat(app): add #dev-primitives dev-only route

Open with localhost:5173/#dev-primitives (or whatever Vite port) in
dev mode to view the design overhaul primitives showcase. Stripped
from production builds via import.meta.env.DEV guard."
```

---

## Task 21: Verify end-to-end

- [ ] **Step 1: Lint**

Run: `npm run lint`

Expected: exit 0, no errors. Warnings on legacy files unrelated to this PR are acceptable; warnings introduced by this PR are not.

- [ ] **Step 2: Type-check (full project)**

Run: `npx tsc --noEmit -p tsconfig.json`

Expected: exit 0.

- [ ] **Step 3: Format (idempotent)**

Run: `npm run format`

Expected: writes formatting where needed; commit only if something changed:

```bash
git diff --quiet || (git add -A && git commit -m "chore: prettier format design-overhaul phase 1 files")
```

- [ ] **Step 4: Production build smoke test**

Run: `npm run build`

Expected: exit 0. The new tokens, primitives, and chrome compile into the renderer bundle; the dev-only `DevPrimitivesView` is tree-shaken out (due to `import.meta.env.DEV` guard).

- [ ] **Step 5: Manual visual check (dev mode)**

Run: `npm run dev`

In the Electron window or browser preview, open the DevTools console and run:

```js
window.location.hash = "#dev-primitives";
location.reload();
```

Visually verify:
1. Titlebar shows logo, "droppilot · v2.5.7", "connected" pill, "api ok · 124ms" pill, sun/moon toggle, settings icon, native-style min/max/close buttons.
2. AppNav shows 6 lowercase mono items, the active one has a violet underline + glow.
3. Buttons section shows 6 button variants with violet primary.
4. Pills + Badges show all signal tones in both Pill (mono uppercase, with dot) and Badge (smaller, without dot) forms.
5. Inputs show mono text with violet focus ring when clicked.
6. Stat grid shows 4 columns of label/value/sub; `eta` value is violet, `viewers` sub is amber, `next claim` sub is green.
7. Card panel shows "queue · next up" header with "manage →" right-action; the table rows hover to elevated-2 background.
8. Activity feed shows 3 items with ok/info/warn icon badges and dotted dividers.
9. Statusbar at the bottom: green dot + "engine: running", separators, cpu/mem/⌘K on the right.
10. Click the theme toggle: layout flips to light variant; all colors track tokens; nothing breaks.
11. Remove the hash, reload: original app renders unchanged.

- [ ] **Step 6: Final commit (if any formatting from Step 3) and branch summary**

Run:

```bash
git log --oneline feat/design-overhaul ^main
```

Expected: a clean linear history of Phase 1 commits. Confirm:
- chore(deps): add lucide-react
- feat(tokens): add design-overhaul token layer
- feat(icons): add central Lucide icon module
- feat(brand): add Logo component
- feat(ui): extend Button with dp-*
- feat(ui): add dp-* badge variants
- feat(ui): add CardAction slot
- feat(ui): add Input tone='dp'
- feat(ui): add SelectTrigger tone='dp'
- feat(ui): add Pill primitive
- feat(ui): add SectionLabel primitive
- feat(ui): add Stat primitive
- feat(ui): add FeedItem primitive
- feat(ui): add Table primitive
- feat(chrome): add Titlebar component
- feat(chrome): add AppNav component
- feat(chrome): add Statusbar component
- chore(chrome): add barrel export
- feat(dev): add /dev-primitives showcase view
- feat(app): add #dev-primitives dev-only route
- chore: prettier format (if any)

Phase 1 is complete when all six verification steps pass. Phase 2 (Overview view) can begin once this branch is merged or the work continues here.

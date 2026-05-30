# Changelog History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a browsable history of DropPilot releases inside Settings → Updates, sourced live from the GitHub Releases API and filtered to the user's update channel.

**Architecture:** Pure helpers in `src/shared/releaseHistory.ts` (parse/normalize/filter/orchestrate, fully unit-tested with an injected fetch). A thin main-process IPC handler (`app/releaseHistory`) holds a 30-min in-memory cache and calls the orchestrator. The renderer exposes it via preload, consumes it through a `useReleaseHistory` hook, and renders a `ReleaseHistory` component inside `UpdatesSection`.

**Tech Stack:** TypeScript, Electron (main + preload + renderer), React 19, Vitest, Tailwind with `--dp-*` design tokens.

---

## File Structure

- **Create** `src/shared/releaseHistory.ts` — types + pure helpers + orchestrator. Importable by both main and renderer (mirrors `src/shared/updateChannels.ts`).
- **Create** `src/shared/releaseHistory.test.ts` — unit tests for the pure helpers.
- **Modify** `src/main/ipc/index.ts` — add `app/releaseHistory` handler + module cache.
- **Modify** `src/preload/index.ts` — expose `app.releaseHistory()`.
- **Create** `src/renderer/shared/hooks/app/useReleaseHistory.ts` — fetch hook.
- **Create** `src/renderer/features/settings/sections/ReleaseHistory.tsx` — UI list + cards.
- **Modify** `src/renderer/features/settings/sections/UpdatesSection.tsx` — render `<ReleaseHistory />`.
- **Modify** `src/renderer/shared/i18n.tsx` — new en + de strings.

No new dependencies. `window.electronAPI` typing flows automatically because `ElectronAPI = typeof api` in preload.

---

## Task 1: Shared module — types + `parseReleaseNotes`

**Files:**
- Create: `src/shared/releaseHistory.ts`
- Test: `src/shared/releaseHistory.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/releaseHistory.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseReleaseNotes } from "./releaseHistory";

describe("parseReleaseNotes", () => {
  it("splits the CI body into user notes and full changelog", () => {
    const body = [
      "## What's new for users",
      "",
      "- Heatmap hover now matches the design.",
      "- Watch-time stats no longer over-count.",
      "",
      "## Full changelog",
      "",
      "fix(watch): stop inflating stats",
    ].join("\n");
    const { notes, fullChangelog } = parseReleaseNotes(body);
    expect(notes).toEqual([
      "Heatmap hover now matches the design.",
      "Watch-time stats no longer over-count.",
    ]);
    expect(fullChangelog).toContain("fix(watch): stop inflating stats");
  });

  it("returns empty for an empty body", () => {
    expect(parseReleaseNotes("")).toEqual({ notes: [], fullChangelog: "" });
    expect(parseReleaseNotes(null)).toEqual({ notes: [], fullChangelog: "" });
  });

  it("treats a marker-less bullet list as notes", () => {
    const { notes, fullChangelog } = parseReleaseNotes("- one\n- two");
    expect(notes).toEqual(["one", "two"]);
    expect(fullChangelog).toBe("");
  });

  it("falls back to full changelog when there is no recognizable structure", () => {
    const { notes, fullChangelog } = parseReleaseNotes("just some prose, no bullets");
    expect(notes).toEqual([]);
    expect(fullChangelog).toBe("just some prose, no bullets");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/releaseHistory.test.ts`
Expected: FAIL — `parseReleaseNotes` is not exported / module missing.

- [ ] **Step 3: Write minimal implementation**

Create `src/shared/releaseHistory.ts`:

```ts
export const GITHUB_RELEASES_URL =
  "https://api.github.com/repos/rxm96/droppilot/releases?per_page=100";

export const RELEASE_CACHE_TTL_MS = 30 * 60_000;

const FULL_CHANGELOG_MARKER = /^#{1,6}\s*Full changelog\b/im;
const WHATS_NEW_HEADING = /^#{1,6}\s*What's new[^\n]*\n/i;

export type ReleaseEntry = {
  version: string; // tag without a leading "v", e.g. "3.0.5"
  tag: string; // raw tag, e.g. "v3.0.5"
  date: number; // published_at as epoch ms (0 if unknown)
  prerelease: boolean;
  notes: string[]; // "What's new for users" bullets
  fullChangelog: string; // remaining technical changelog (raw)
  url: string; // html_url of the GitHub release
};

export type ReleaseHistoryResult =
  | { status: "ready"; releases: ReleaseEntry[]; stale: boolean }
  | { status: "error"; message: string };

export type ReleaseCache = { at: number; entries: ReleaseEntry[] } | null;

export function parseReleaseNotes(body: string | null | undefined): {
  notes: string[];
  fullChangelog: string;
} {
  const text = String(body ?? "").trim();
  if (!text) return { notes: [], fullChangelog: "" };

  const markerMatch = text.match(FULL_CHANGELOG_MARKER);
  let whatsNew = text;
  let fullChangelog = "";
  if (markerMatch && markerMatch.index !== undefined) {
    whatsNew = text.slice(0, markerMatch.index);
    fullChangelog = text.slice(markerMatch.index + markerMatch[0].length).trim();
  }

  whatsNew = whatsNew.replace(WHATS_NEW_HEADING, "");
  const notes = whatsNew
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);

  if (notes.length === 0 && !fullChangelog) {
    return { notes: [], fullChangelog: text };
  }
  return { notes, fullChangelog };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/releaseHistory.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/releaseHistory.ts src/shared/releaseHistory.test.ts
git commit -m "feat(changelog): add release-notes parser + shared types"
```

---

## Task 2: `normalizeRelease`, `filterReleasesByChannel`, `isReleaseHistoryResult`

**Files:**
- Modify: `src/shared/releaseHistory.ts`
- Test: `src/shared/releaseHistory.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/shared/releaseHistory.test.ts`:

```ts
import {
  filterReleasesByChannel,
  isReleaseHistoryResult,
  normalizeRelease,
  type ReleaseEntry,
} from "./releaseHistory";

const entry = (over: Partial<ReleaseEntry> = {}): ReleaseEntry => ({
  version: "3.0.5",
  tag: "v3.0.5",
  date: 1000,
  prerelease: false,
  notes: [],
  fullChangelog: "",
  url: "",
  ...over,
});

describe("normalizeRelease", () => {
  it("maps a GitHub release and strips the leading v", () => {
    const result = normalizeRelease({
      tag_name: "v3.0.5",
      published_at: "2026-05-30T00:00:00Z",
      prerelease: false,
      draft: false,
      body: "## What's new for users\n\n- Did a thing.",
      html_url: "https://example.test/v3.0.5",
    });
    expect(result).not.toBeNull();
    expect(result?.version).toBe("3.0.5");
    expect(result?.tag).toBe("v3.0.5");
    expect(result?.date).toBe(Date.parse("2026-05-30T00:00:00Z"));
    expect(result?.notes).toEqual(["Did a thing."]);
  });

  it("returns null for drafts and missing tags", () => {
    expect(normalizeRelease({ tag_name: "v1", draft: true })).toBeNull();
    expect(normalizeRelease({ published_at: "2026-05-30T00:00:00Z" })).toBeNull();
  });
});

describe("filterReleasesByChannel", () => {
  const stable = entry({ tag: "v3.0.5", prerelease: false, date: 2 });
  const pre = entry({ tag: "v3.1.0-rc.1", prerelease: true, date: 3 });

  it("hides prereleases on the stable channel", () => {
    expect(filterReleasesByChannel([stable, pre], false).map((r) => r.tag)).toEqual(["v3.0.5"]);
  });

  it("keeps prereleases on the preview channel, newest first", () => {
    expect(filterReleasesByChannel([stable, pre], true).map((r) => r.tag)).toEqual([
      "v3.1.0-rc.1",
      "v3.0.5",
    ]);
  });
});

describe("isReleaseHistoryResult", () => {
  it("accepts ready with a releases array and error results", () => {
    expect(isReleaseHistoryResult({ status: "ready", releases: [], stale: false })).toBe(true);
    expect(isReleaseHistoryResult({ status: "error", message: "x" })).toBe(true);
  });

  it("rejects malformed values", () => {
    expect(isReleaseHistoryResult(null)).toBe(false);
    expect(isReleaseHistoryResult({ status: "ready" })).toBe(false);
    expect(isReleaseHistoryResult({ status: "weird" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/shared/releaseHistory.test.ts`
Expected: FAIL — `normalizeRelease` / `filterReleasesByChannel` / `isReleaseHistoryResult` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/shared/releaseHistory.ts`:

```ts
export type RawGithubRelease = {
  tag_name?: unknown;
  name?: unknown;
  published_at?: unknown;
  created_at?: unknown;
  prerelease?: unknown;
  draft?: unknown;
  body?: unknown;
  html_url?: unknown;
};

export function normalizeRelease(raw: RawGithubRelease): ReleaseEntry | null {
  if (!raw || typeof raw !== "object") return null;
  if (raw.draft === true) return null;
  const tag = typeof raw.tag_name === "string" ? raw.tag_name.trim() : "";
  if (!tag) return null;

  const dateStr =
    typeof raw.published_at === "string"
      ? raw.published_at
      : typeof raw.created_at === "string"
        ? raw.created_at
        : null;
  const parsed = dateStr ? Date.parse(dateStr) : NaN;
  const { notes, fullChangelog } = parseReleaseNotes(typeof raw.body === "string" ? raw.body : "");

  return {
    version: tag.replace(/^v/i, ""),
    tag,
    date: Number.isFinite(parsed) ? parsed : 0,
    prerelease: raw.prerelease === true,
    notes,
    fullChangelog,
    url: typeof raw.html_url === "string" ? raw.html_url : "",
  };
}

export function filterReleasesByChannel(
  entries: ReleaseEntry[],
  allowPrerelease: boolean,
): ReleaseEntry[] {
  const filtered = allowPrerelease ? entries : entries.filter((e) => !e.prerelease);
  return [...filtered].sort((a, b) => b.date - a.date);
}

export function isReleaseHistoryResult(value: unknown): value is ReleaseHistoryResult {
  if (!value || typeof value !== "object") return false;
  const v = value as { status?: unknown; releases?: unknown };
  if (v.status === "ready") return Array.isArray(v.releases);
  if (v.status === "error") return true;
  return false;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/shared/releaseHistory.test.ts`
Expected: PASS (all tests across both describe groups).

- [ ] **Step 5: Commit**

```bash
git add src/shared/releaseHistory.ts src/shared/releaseHistory.test.ts
git commit -m "feat(changelog): normalize/filter releases + result guard"
```

---

## Task 3: `loadReleaseHistory` orchestrator (fetch + cache + stale)

**Files:**
- Modify: `src/shared/releaseHistory.ts`
- Test: `src/shared/releaseHistory.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/shared/releaseHistory.test.ts`:

```ts
import { loadReleaseHistory, type FetchLike } from "./releaseHistory";

const okFetch = (payload: unknown): FetchLike =>
  async () => ({ ok: true, status: 200, json: async () => payload });

const rawRelease = (tag: string, prerelease = false) => ({
  tag_name: tag,
  published_at: "2026-05-30T00:00:00Z",
  prerelease,
  draft: false,
  body: "## What's new for users\n\n- note",
  html_url: `https://example.test/${tag}`,
});

describe("loadReleaseHistory", () => {
  it("fetches when there is no cache and returns filtered releases", async () => {
    const { result, cache } = await loadReleaseHistory({
      allowPrerelease: false,
      cache: null,
      now: 10_000,
      fetchImpl: okFetch([rawRelease("v3.0.5"), rawRelease("v3.1.0-rc.1", true)]),
    });
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.releases.map((r) => r.tag)).toEqual(["v3.0.5"]);
      expect(result.stale).toBe(false);
    }
    expect(cache?.entries.length).toBe(2); // cache keeps unfiltered entries
  });

  it("serves a fresh cache without fetching", async () => {
    let called = false;
    const fetchImpl: FetchLike = async () => {
      called = true;
      return { ok: true, status: 200, json: async () => [] };
    };
    const cache = { at: 9_000, entries: [] as never[] };
    const { result } = await loadReleaseHistory({
      allowPrerelease: true,
      cache,
      now: 9_000 + 1000, // within TTL
      fetchImpl,
    });
    expect(called).toBe(false);
    expect(result.status).toBe("ready");
  });

  it("returns the stale cache when the fetch fails", async () => {
    const cache = {
      at: 0,
      entries: [
        {
          version: "3.0.0",
          tag: "v3.0.0",
          date: 1,
          prerelease: false,
          notes: [],
          fullChangelog: "",
          url: "",
        },
      ],
    };
    const failing: FetchLike = async () => {
      throw new Error("offline");
    };
    const { result } = await loadReleaseHistory({
      allowPrerelease: false,
      cache,
      now: RELEASE_CACHE_TTL_MS + 1, // cache expired
      fetchImpl: failing,
    });
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.stale).toBe(true);
      expect(result.releases[0]?.tag).toBe("v3.0.0");
    }
  });

  it("returns an error when the fetch fails and there is no cache", async () => {
    const failing: FetchLike = async () => ({ ok: false, status: 503, json: async () => null });
    const { result } = await loadReleaseHistory({
      allowPrerelease: false,
      cache: null,
      now: 0,
      fetchImpl: failing,
    });
    expect(result.status).toBe("error");
  });
});
```

Note: `RELEASE_CACHE_TTL_MS` is already imported via the earlier import block in Task 1's file (add it to that import if your editor flags it: `import { ..., RELEASE_CACHE_TTL_MS } from "./releaseHistory";`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/shared/releaseHistory.test.ts`
Expected: FAIL — `loadReleaseHistory` / `FetchLike` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/shared/releaseHistory.ts`:

```ts
export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export async function loadReleaseHistory(opts: {
  allowPrerelease: boolean;
  cache: ReleaseCache;
  now: number;
  fetchImpl: FetchLike;
}): Promise<{ result: ReleaseHistoryResult; cache: ReleaseCache }> {
  const { allowPrerelease, cache, now, fetchImpl } = opts;

  if (cache && now - cache.at < RELEASE_CACHE_TTL_MS) {
    return {
      result: {
        status: "ready",
        releases: filterReleasesByChannel(cache.entries, allowPrerelease),
        stale: false,
      },
      cache,
    };
  }

  try {
    const res = await fetchImpl(GITHUB_RELEASES_URL, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const json = (await res.json()) as unknown;
    if (!Array.isArray(json)) throw new Error("Unexpected releases payload");

    const entries = json
      .map((raw) => normalizeRelease(raw as RawGithubRelease))
      .filter((e): e is ReleaseEntry => e !== null);

    return {
      result: {
        status: "ready",
        releases: filterReleasesByChannel(entries, allowPrerelease),
        stale: false,
      },
      cache: { at: now, entries },
    };
  } catch (err) {
    if (cache) {
      return {
        result: {
          status: "ready",
          releases: filterReleasesByChannel(cache.entries, allowPrerelease),
          stale: true,
        },
        cache,
      };
    }
    return {
      result: { status: "error", message: err instanceof Error ? err.message : String(err) },
      cache,
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/shared/releaseHistory.test.ts`
Expected: PASS (all groups).

- [ ] **Step 5: Commit**

```bash
git add src/shared/releaseHistory.ts src/shared/releaseHistory.test.ts
git commit -m "feat(changelog): release-history orchestrator with cache + stale fallback"
```

---

## Task 4: Main IPC handler + preload exposure

**Files:**
- Modify: `src/main/ipc/index.ts` (import near line 17; cache var after the deps destructure ~line 117; handler after the `app/getVersion` handler ~line 495)
- Modify: `src/preload/index.ts` (after `getVersion:` ~line 165)

- [ ] **Step 1: Add the import in `src/main/ipc/index.ts`**

Find the existing line:

```ts
import { allowsPrereleaseBuilds } from "../../shared/updateChannels";
```

Add immediately below it:

```ts
import { loadReleaseHistory, type ReleaseCache } from "../../shared/releaseHistory";
```

- [ ] **Step 2: Add the module cache variable**

Inside the handler-registration function, right after the `deps` destructuring block (the block that ends with `} = deps;`), add:

```ts
  let releaseHistoryCache: ReleaseCache = null;
```

- [ ] **Step 3: Add the handler**

Immediately after the existing `ipcMain.handle("app/getVersion", ...)` block, add:

```ts
  ipcMain.handle("app/releaseHistory", async () => {
    const settings = await loadSettings();
    const allowPrerelease = allowsPrereleaseBuilds(settings.updateChannel);
    const { result, cache } = await loadReleaseHistory({
      allowPrerelease,
      cache: releaseHistoryCache,
      now: Date.now(),
      fetchImpl: fetch,
    });
    releaseHistoryCache = cache;
    return result;
  });
```

- [ ] **Step 4: Expose it in `src/preload/index.ts`**

Find the line in the `app:` block:

```ts
    getVersion: () => ipcRenderer.invoke("app/getVersion"),
```

Add immediately below it:

```ts
    releaseHistory: () => ipcRenderer.invoke("app/releaseHistory"),
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "ipc/index|preload/index|releaseHistory"`
Expected: no output (the pre-existing `warmupEnabled` error in `useAppModel.ts` is unrelated and out of scope — only check the files above are clean).

Run: `npm run build`
Expected: builds successfully (`BUILD_EXIT=0`).

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/index.ts src/preload/index.ts
git commit -m "feat(changelog): app/releaseHistory IPC handler + preload bridge"
```

---

## Task 5: i18n strings (en + de)

**Files:**
- Modify: `src/renderer/shared/i18n.tsx` (en block after line ~627; de block after line ~1646)

- [ ] **Step 1: Add English strings**

Find (English block):

```ts
    "settings.subsection.currentState": "current state",
```

Add immediately below it:

```ts
    "settings.subsection.releaseHistory": "release history",
    "settings.releaseHistory.loading": "Loading releases…",
    "settings.releaseHistory.error": "Couldn't load release history.",
    "settings.releaseHistory.retry": "Retry",
    "settings.releaseHistory.empty": "No releases yet.",
    "settings.releaseHistory.stale": "Couldn't refresh — showing last known.",
    "settings.releaseHistory.current": "Current",
    "settings.releaseHistory.prerelease": "Pre-release",
    "settings.releaseHistory.showOlder": "Show older",
    "settings.releaseHistory.fullChangelog": "Full changelog",
```

- [ ] **Step 2: Add German strings**

Find (German block):

```ts
    "settings.subsection.currentState": "aktueller status",
```

Add immediately below it:

```ts
    "settings.subsection.releaseHistory": "release-verlauf",
    "settings.releaseHistory.loading": "Lade Releases…",
    "settings.releaseHistory.error": "Konnte den Release-Verlauf nicht laden.",
    "settings.releaseHistory.retry": "Erneut versuchen",
    "settings.releaseHistory.empty": "Noch keine Releases.",
    "settings.releaseHistory.stale": "Aktualisierung fehlgeschlagen — zeige letzten Stand.",
    "settings.releaseHistory.current": "Aktuell",
    "settings.releaseHistory.prerelease": "Vorabversion",
    "settings.releaseHistory.showOlder": "Ältere anzeigen",
    "settings.releaseHistory.fullChangelog": "Vollständiges Changelog",
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "i18n"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/shared/i18n.tsx
git commit -m "feat(changelog): i18n strings for release history (en + de)"
```

---

## Task 6: Renderer hook `useReleaseHistory`

**Files:**
- Create: `src/renderer/shared/hooks/app/useReleaseHistory.ts`

- [ ] **Step 1: Create the hook**

Create `src/renderer/shared/hooks/app/useReleaseHistory.ts`:

```ts
import { useCallback, useEffect, useState } from "react";
import { isReleaseHistoryResult, type ReleaseEntry } from "../../../../shared/releaseHistory";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; releases: ReleaseEntry[]; stale: boolean }
  | { status: "error"; message: string };

export function useReleaseHistory(enabled: boolean) {
  const [state, setState] = useState<State>({ status: "idle" });

  const load = useCallback(async () => {
    setState((prev) => (prev.status === "ready" ? prev : { status: "loading" }));
    try {
      const res: unknown = await window.electronAPI.app.releaseHistory();
      if (!isReleaseHistoryResult(res)) {
        setState({ status: "error", message: "Invalid release history response" });
        return;
      }
      if (res.status === "error") {
        setState({ status: "error", message: res.message });
        return;
      }
      setState({ status: "ready", releases: res.releases, stale: res.stale });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  useEffect(() => {
    if (enabled && state.status === "idle") void load();
  }, [enabled, load, state.status]);

  return { state, reload: load };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "useReleaseHistory"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/shared/hooks/app/useReleaseHistory.ts
git commit -m "feat(changelog): useReleaseHistory renderer hook"
```

---

## Task 7: `ReleaseHistory` component + wire into `UpdatesSection`

**Files:**
- Create: `src/renderer/features/settings/sections/ReleaseHistory.tsx`
- Modify: `src/renderer/features/settings/sections/UpdatesSection.tsx`

- [ ] **Step 1: Create the component**

Create `src/renderer/features/settings/sections/ReleaseHistory.tsx`:

```tsx
import * as React from "react";
import { useI18n } from "@renderer/shared/i18n";
import { Button } from "@renderer/shared/components/ui/button";
import { Pill } from "@renderer/shared/components/ui/pill";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { useReleaseHistory } from "@renderer/shared/hooks/app/useReleaseHistory";
import type { ReleaseEntry } from "../../../../shared/releaseHistory";

const INITIAL_VISIBLE = 30;

function ReleaseCard({
  release,
  isCurrent,
  dateText,
}: {
  release: ReleaseEntry;
  isCurrent: boolean;
  dateText: string;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = React.useState(false);
  return (
    <div className="rounded-[var(--dp-radius-md)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[12px] font-semibold text-[color:var(--dp-text)]">
          {release.tag}
        </span>
        {isCurrent && <Pill tone="accent">{t("settings.releaseHistory.current")}</Pill>}
        {release.prerelease && <Pill tone="warn">{t("settings.releaseHistory.prerelease")}</Pill>}
        {dateText && (
          <span className="ml-auto font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
            {dateText}
          </span>
        )}
      </div>
      {release.notes.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {release.notes.map((note, i) => (
            <li
              key={i}
              className="flex gap-2 text-[12px] leading-relaxed text-[color:var(--dp-text-dim)]"
            >
              <span className="text-[color:var(--dp-accent)]">·</span>
              <span>{note}</span>
            </li>
          ))}
        </ul>
      )}
      {release.fullChangelog && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="font-mono text-[10px] uppercase tracking-[0.06em] text-[color:var(--dp-text-dimmer)] hover:text-[color:var(--dp-accent)]"
          >
            {t("settings.releaseHistory.fullChangelog")} {expanded ? "−" : "+"}
          </button>
          {expanded && (
            <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-[color:var(--dp-text-dimmer)]">
              {release.fullChangelog}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function ReleaseHistory() {
  const { t, language } = useI18n();
  const { state, reload } = useReleaseHistory(true);
  const [showAll, setShowAll] = React.useState(false);
  const [currentVersion, setCurrentVersion] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void window.electronAPI.app?.getVersion?.().then((res) => {
      const v = (res as { version?: string } | undefined)?.version;
      if (!cancelled && typeof v === "string") setCurrentVersion(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const fmtDate = (ms: number) => (ms > 0 ? new Date(ms).toLocaleDateString(language) : "");

  return (
    <div className="mt-6">
      <SectionLabel>{t("settings.subsection.releaseHistory")}</SectionLabel>

      {state.status === "loading" || state.status === "idle" ? (
        <p className="mt-3 font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
          {t("settings.releaseHistory.loading")}
        </p>
      ) : state.status === "error" ? (
        <div className="mt-3 flex items-center gap-3">
          <span className="font-mono text-[11px] text-[color:var(--dp-signal-err)]">
            {t("settings.releaseHistory.error")}
          </span>
          <Button variant="dp-secondary" size="dp-sm" onClick={() => void reload()}>
            {t("settings.releaseHistory.retry")}
          </Button>
        </div>
      ) : state.releases.length === 0 ? (
        <p className="mt-3 font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
          {t("settings.releaseHistory.empty")}
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {state.stale && (
            <p className="font-mono text-[10px] text-[color:var(--dp-signal-warn)]">
              {t("settings.releaseHistory.stale")}
            </p>
          )}
          {(showAll ? state.releases : state.releases.slice(0, INITIAL_VISIBLE)).map((r) => (
            <ReleaseCard
              key={r.tag}
              release={r}
              isCurrent={currentVersion === r.version}
              dateText={fmtDate(r.date)}
            />
          ))}
          {!showAll && state.releases.length > INITIAL_VISIBLE && (
            <Button
              variant="dp-ghost"
              size="dp-sm"
              className="self-start"
              onClick={() => setShowAll(true)}
            >
              {t("settings.releaseHistory.showOlder")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Render it inside `UpdatesSection`**

In `src/renderer/features/settings/sections/UpdatesSection.tsx`, add the import after the existing `SectionLabel` import:

```tsx
import { ReleaseHistory } from "./ReleaseHistory";
```

Then, find the closing of the "current state" block — the `</div>` that closes `<div className="mt-6">` (the block opened right after the release-channel `SettingRow`). Immediately **after** that closing `</div>` and **before** the final `</div>` of the component's returned root, insert:

```tsx
      <ReleaseHistory />
```

The end of the component should read:

```tsx
        <SettingRow
          divided
          label={t("settings.row.updateActions.label")}
          description={t("settings.row.updateActions.description")}
          control={
            <div className="flex flex-wrap gap-2">
              {/* ...existing buttons... */}
            </div>
          }
        />
      </div>

      <ReleaseHistory />
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles and builds**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "ReleaseHistory|UpdatesSection"`
Expected: no output.

Run: `npm run build`
Expected: `BUILD_EXIT=0`.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/features/settings/sections/ReleaseHistory.tsx src/renderer/features/settings/sections/UpdatesSection.tsx
git commit -m "feat(changelog): release-history UI in Settings -> Updates"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: `0 problems` (no new warnings/errors introduced).

- [ ] **Step 2: Format**

Run: `npm run format:check`
Expected: "All matched files use Prettier code style!" (if it fails, run `npx prettier --write` on the new/changed files and re-check, then amend the relevant commit).

- [ ] **Step 3: Full test suite**

Run: `npm test`
Expected: all test files pass, including `src/shared/releaseHistory.test.ts`.

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: `BUILD_EXIT=0`.

- [ ] **Step 5: Manual smoke test (packaged or dev)**

Open the app → Settings → Updates. Confirm:
- "Release history" subsection renders below the update actions.
- Versions appear newest-first; the installed version shows a "Current" pill.
- On the stable channel, no prereleases appear; switching to preview and reopening shows rc/preview entries.
- "Full changelog" expander toggles; "Show older" reveals entries beyond the first 30.
- With networking disabled, the error state (or stale note over a cached list) appears with a working Retry.

- [ ] **Step 6: Push the branch and open a PR**

```bash
git push -u origin feat/changelog-history
gh pr create --title "feat: in-app changelog history" --body "Adds a release-history view in Settings -> Updates, sourced live from the GitHub Releases API and filtered by update channel. Spec: docs/superpowers/specs/2026-05-30-changelog-history-design.md"
```

---

## Notes for the implementer

- **Date.now() / fetch in shared code:** the orchestrator takes `now` and `fetchImpl` as inputs so it stays pure and testable. Only the main IPC handler injects the real `Date.now()` and global `fetch`.
- **No new deps, no markdown library:** notes are pre-parsed into `string[]`; the full changelog renders as preformatted text.
- **Pre-existing type error:** `useAppModel.ts` has an unrelated `warmupEnabled` tsc error that predates this work. Do not fix it here; just ensure your files add no new errors.
- **Caching is unfiltered:** the main cache stores all normalized entries; channel filtering happens per-call, so toggling the update channel never forces a refetch.

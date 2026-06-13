# Discord / Webhook Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an outbound Discord webhook notification channel that mirrors DropPilot's existing alert events, fully independent of OS notifications (own master switch, focus-agnostic, per-event toggles).

**Architecture:** All alerts already funnel through one dispatch point (`notify()` in `useSmartAlerts.ts`). Make that dispatch route per-channel via a pure `resolveAlertTargets(type, config)`; build Discord embeds with a pure `buildDiscordPayload`; POST from the main process via a new `webhook/send` IPC handler with an https/SSRF guard. Per-event gating moves out of the producer hooks (`useAlertEffects`, `useDropClaimAlerts`) into the dispatcher so OS and webhook channels are gated independently.

**Tech Stack:** Electron 40 (main: Node global `fetch`), React 19 + TypeScript renderer, Vitest (pure-function tests only — repo convention). Settings persist through `src/shared/settingsSchema.ts` (main) + the manual renderer threading chain.

**Spec:** `docs/superpowers/specs/2026-06-13-discord-webhook-alerts-design.md`

**Conventions:** Run a single test file with `npx vitest run <path>`. Full gate before any push: `npm run typecheck` (BOTH tsconfigs) → `npm test` → `npm run format:check`. Run `npm run format` on changed files before committing. Commit messages follow Conventional Commits.

**Compile-unit note:** Tasks 1–7 and Task 10 each leave the tree green and are independently committable. **Tasks 8, 9, and 11 are one TypeScript compile unit** — the `useSmartAlerts` rewrite, its callers, the `settingsProps` additions, and the `SettingsView`/`AlertsSection` props are mutually dependent, so `npm run typecheck` is only fully green again after **Task 11**. This is expected: within Tasks 8–9, verify by reading the edited code against the signatures it must match (the dedicated unit tests from Tasks 1–3 compile independently and still pass), then run the full gate at Task 11/12. If executing via subagent-driven-development, treat Tasks 8→9→11 as a single review checkpoint.

---

## File map

**Create:**

- `src/renderer/shared/domain/alerts/alertRouting.ts` — `AlertEventType`, `resolveAlertTargets` (pure)
- `src/renderer/shared/domain/alerts/alertRouting.test.ts`
- `src/renderer/shared/domain/alerts/discordPayload.ts` — `buildDiscordPayload` (pure)
- `src/renderer/shared/domain/alerts/discordPayload.test.ts`
- `src/main/integrations/webhook.ts` — `isAllowedWebhookUrl`, `sendWebhook`
- `src/main/integrations/webhook.test.ts`

**Modify:**

- `src/preload/index.ts` — add `webhook.send` to `api`
- `src/main/ipc/index.ts` — add `webhook/send` handler
- `src/shared/settingsSchema.ts` — add 7 webhook keys
- `src/shared/settingsSchema.test.ts` — add keys to defaults + key-order assertions
- `src/shared/settingsSchema.characterization.test.ts` — add keys to full-settings expectations
- `src/renderer/shared/hooks/app/useSmartAlerts.ts` — typed per-channel dispatch
- `src/renderer/shared/hooks/inventory/useDropClaimAlerts.ts` — pass `type`, drop OS gate
- `src/renderer/shared/hooks/app/useAlertEffects.ts` — pass `type`, drop OS gates
- `src/renderer/shared/hooks/app/useSettingsStore.ts` — thread 7 settings
- `src/renderer/shared/hooks/app/useSettingsActions.ts` — handlers for 7 settings
- `src/renderer/shared/hooks/app/useAppActions.ts` — thread 7 save fns
- `src/renderer/shared/hooks/app/useAppModel.ts` — wire dispatcher config + settingsProps
- `src/renderer/features/settings/SettingsView.tsx` — props + pass to AlertsSection
- `src/renderer/features/settings/sections/AlertsSection.tsx` — webhook subsection + test
- `src/renderer/shared/i18n.tsx` — EN + DE keys

---

## Task 1: Pure alert routing function

**Files:**

- Create: `src/renderer/shared/domain/alerts/alertRouting.ts`
- Test: `src/renderer/shared/domain/alerts/alertRouting.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/shared/domain/alerts/alertRouting.test.ts
import { describe, expect, it } from "vitest";
import { resolveAlertTargets, type AlertRoutingConfig } from "./alertRouting";

const base: AlertRoutingConfig = {
  alertsEnabled: true,
  notifyWhileFocused: false,
  focused: false,
  osToggles: {
    "drop-claimed": true,
    "drop-ending-soon": true,
    "watch-error": true,
    "auto-switch": true,
    "new-drops": true,
  },
  webhookEnabled: true,
  webhookUrlSet: true,
  webhookToggles: {
    "drop-claimed": true,
    "drop-ending-soon": false,
    "watch-error": true,
    "auto-switch": false,
    "new-drops": false,
  },
};

describe("resolveAlertTargets", () => {
  it("routes to both channels when both enable the event", () => {
    expect(resolveAlertTargets("drop-claimed", base)).toEqual({ os: true, webhook: true });
  });

  it("webhook is focus-agnostic; OS is suppressed while focused (notifyWhileFocused off)", () => {
    const focused = { ...base, focused: true };
    expect(resolveAlertTargets("watch-error", focused)).toEqual({ os: false, webhook: true });
  });

  it("OS fires while focused when notifyWhileFocused is on", () => {
    const cfg = { ...base, focused: true, notifyWhileFocused: true };
    expect(resolveAlertTargets("watch-error", cfg).os).toBe(true);
  });

  it("respects independent per-event toggles", () => {
    expect(resolveAlertTargets("new-drops", base)).toEqual({ os: true, webhook: false });
    expect(resolveAlertTargets("auto-switch", base)).toEqual({ os: true, webhook: false });
  });

  it("OS master off disables OS only; webhook stays independent", () => {
    const cfg = { ...base, alertsEnabled: false };
    expect(resolveAlertTargets("drop-claimed", cfg)).toEqual({ os: false, webhook: true });
  });

  it("webhook master off disables webhook only", () => {
    const cfg = { ...base, webhookEnabled: false };
    expect(resolveAlertTargets("drop-claimed", cfg)).toEqual({ os: true, webhook: false });
  });

  it("webhook needs a URL set", () => {
    const cfg = { ...base, webhookUrlSet: false };
    expect(resolveAlertTargets("drop-claimed", cfg).webhook).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/shared/domain/alerts/alertRouting.test.ts`
Expected: FAIL — `Failed to resolve import "./alertRouting"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/renderer/shared/domain/alerts/alertRouting.ts
export type AlertEventType =
  | "drop-claimed"
  | "drop-ending-soon"
  | "watch-error"
  | "auto-switch"
  | "new-drops";

export type AlertChannelToggles = Record<AlertEventType, boolean>;

export type AlertRoutingConfig = {
  // OS channel
  alertsEnabled: boolean;
  notifyWhileFocused: boolean;
  focused: boolean;
  osToggles: AlertChannelToggles;
  // Webhook channel (focus-agnostic, independent of the OS master)
  webhookEnabled: boolean;
  webhookUrlSet: boolean;
  webhookToggles: AlertChannelToggles;
};

/** Pure routing decision for one event type. Dedupe lives in the dispatcher. */
export function resolveAlertTargets(
  type: AlertEventType,
  config: AlertRoutingConfig,
): { os: boolean; webhook: boolean } {
  const os =
    config.alertsEnabled &&
    config.osToggles[type] &&
    (config.notifyWhileFocused || !config.focused);
  const webhook = config.webhookEnabled && config.webhookUrlSet && config.webhookToggles[type];
  return { os, webhook };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/shared/domain/alerts/alertRouting.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/shared/domain/alerts/alertRouting.ts src/renderer/shared/domain/alerts/alertRouting.test.ts
git commit -m "feat(alerts): pure resolveAlertTargets channel router"
```

---

## Task 2: Pure Discord payload builder

**Files:**

- Create: `src/renderer/shared/domain/alerts/discordPayload.ts`
- Test: `src/renderer/shared/domain/alerts/discordPayload.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/shared/domain/alerts/discordPayload.test.ts
import { describe, expect, it } from "vitest";
import { buildDiscordPayload } from "./discordPayload";

describe("buildDiscordPayload", () => {
  it("builds a single-embed Discord body with username and timestamp", () => {
    const body = buildDiscordPayload({
      type: "drop-claimed",
      title: "Drop claimed",
      body: "Some Drop (Some Game)",
      timestampIso: "2026-06-13T10:00:00.000Z",
    });
    expect(body.username).toBe("DropPilot");
    expect(body.embeds).toHaveLength(1);
    expect(body.embeds[0]).toMatchObject({
      title: "Drop claimed",
      description: "Some Drop (Some Game)",
      color: 0x2ecc71,
      timestamp: "2026-06-13T10:00:00.000Z",
    });
  });

  it("maps a distinct color per event type", () => {
    const color = (type: Parameters<typeof buildDiscordPayload>[0]["type"]) =>
      buildDiscordPayload({ type, title: "t", timestampIso: "x" }).embeds[0].color;
    expect(color("watch-error")).toBe(0xe74c3c);
    expect(color("drop-ending-soon")).toBe(0xe67e22);
    expect(color("auto-switch")).toBe(0x3498db);
    expect(color("new-drops")).toBe(0x8b5cf6);
  });

  it("omits description when body is absent", () => {
    const body = buildDiscordPayload({ type: "new-drops", title: "New drops", timestampIso: "x" });
    expect(body.embeds[0]).not.toHaveProperty("description");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/shared/domain/alerts/discordPayload.test.ts`
Expected: FAIL — cannot resolve `./discordPayload`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/renderer/shared/domain/alerts/discordPayload.ts
import type { AlertEventType } from "./alertRouting";

export type DiscordWebhookBody = {
  username: string;
  embeds: Array<{ title: string; description?: string; color: number; timestamp: string }>;
};

const EMBED_COLOR: Record<AlertEventType, number> = {
  "drop-claimed": 0x2ecc71,
  "watch-error": 0xe74c3c,
  "drop-ending-soon": 0xe67e22,
  "auto-switch": 0x3498db,
  "new-drops": 0x8b5cf6,
};

export function buildDiscordPayload(event: {
  type: AlertEventType;
  title: string;
  body?: string;
  timestampIso: string;
}): DiscordWebhookBody {
  return {
    username: "DropPilot",
    embeds: [
      {
        title: event.title,
        ...(event.body ? { description: event.body } : {}),
        color: EMBED_COLOR[event.type],
        timestamp: event.timestampIso,
      },
    ],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/shared/domain/alerts/discordPayload.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/shared/domain/alerts/discordPayload.ts src/renderer/shared/domain/alerts/discordPayload.test.ts
git commit -m "feat(alerts): pure Discord embed payload builder"
```

---

## Task 3: Main-process webhook sender + URL guard

**Files:**

- Create: `src/main/integrations/webhook.ts`
- Test: `src/main/integrations/webhook.test.ts`

- [ ] **Step 1: Write the failing test** (only the pure `isAllowedWebhookUrl` is unit-tested; `sendWebhook` is thin transport)

```ts
// src/main/integrations/webhook.test.ts
import { describe, expect, it } from "vitest";
import { isAllowedWebhookUrl } from "./webhook";

describe("isAllowedWebhookUrl", () => {
  it("accepts a public https Discord webhook URL", () => {
    expect(isAllowedWebhookUrl("https://discord.com/api/webhooks/123/abc")).toBe(true);
  });

  it("rejects non-https", () => {
    expect(isAllowedWebhookUrl("http://discord.com/api/webhooks/123/abc")).toBe(false);
    expect(isAllowedWebhookUrl("ftp://example.com")).toBe(false);
  });

  it("rejects unparseable input", () => {
    expect(isAllowedWebhookUrl("not a url")).toBe(false);
    expect(isAllowedWebhookUrl("")).toBe(false);
  });

  it("rejects localhost and .local hosts", () => {
    expect(isAllowedWebhookUrl("https://localhost/x")).toBe(false);
    expect(isAllowedWebhookUrl("https://myhost.local/x")).toBe(false);
  });

  it("rejects private and loopback IPv4 literals", () => {
    expect(isAllowedWebhookUrl("https://127.0.0.1/x")).toBe(false);
    expect(isAllowedWebhookUrl("https://10.0.0.5/x")).toBe(false);
    expect(isAllowedWebhookUrl("https://192.168.1.10/x")).toBe(false);
    expect(isAllowedWebhookUrl("https://172.16.0.1/x")).toBe(false);
    expect(isAllowedWebhookUrl("https://169.254.1.1/x")).toBe(false);
  });

  it("rejects IPv6 loopback / unique-local", () => {
    expect(isAllowedWebhookUrl("https://[::1]/x")).toBe(false);
    expect(isAllowedWebhookUrl("https://[fc00::1]/x")).toBe(false);
  });

  it("accepts a public IPv4 literal over https", () => {
    expect(isAllowedWebhookUrl("https://203.0.113.10/x")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/integrations/webhook.test.ts`
Expected: FAIL — cannot resolve `./webhook`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/main/integrations/webhook.ts

/**
 * Basic SSRF guard: https-only, and reject hosts that resolve to the local
 * machine / private networks by literal form. Hostname-based DNS rebinding is
 * out of scope — the URL is user-supplied and the payload carries only drop
 * titles, no secrets.
 */
export function isAllowedWebhookUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;

  // URL wraps IPv6 literals in brackets; strip them for comparison.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local")) return false;
  if (host === "::1") return false;
  // IPv6 unique-local (fc00::/7) starts fc.. or fd..
  if (host.includes(":") && (host.startsWith("fc") || host.startsWith("fd"))) return false;

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 0 || a === 127 || a === 10) return false; // this-network / loopback / private
    if (a === 192 && b === 168) return false; // private
    if (a === 172 && b >= 16 && b <= 31) return false; // private
    if (a === 169 && b === 254) return false; // link-local
  }
  return true;
}

/** Single-attempt POST with a 10s timeout. Surfaces (not retries) 429. */
export async function sendWebhook(
  url: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; error?: string }> {
  if (!isAllowedWebhookUrl(url)) return { ok: false, status: 0, error: "invalid-url" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (res.status === 429) {
      const retryAfter = res.headers.get("retry-after");
      return {
        ok: false,
        status: 429,
        error: retryAfter ? `rate-limited retry-after=${retryAfter}` : "rate-limited",
      };
    }
    if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status };
    return { ok: false, status: res.status, error: `http-${res.status}` };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/integrations/webhook.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/integrations/webhook.ts src/main/integrations/webhook.test.ts
git commit -m "feat(alerts): main-process webhook sender with https/SSRF guard"
```

---

## Task 4: Preload bridge + IPC handler

**Files:**

- Modify: `src/preload/index.ts` (add `webhook` to `api`, after the `logs` block ~line 145)
- Modify: `src/main/ipc/index.ts` (add handler after the `app/notify` handler ~line 526; add import near other imports)

No new test (IPC/preload wiring is verified by typecheck + the manual smoke in Task 12).

- [ ] **Step 1: Add the preload bridge**

In `src/preload/index.ts`, inside the `api` object, after the `logs: { ... }` block (before the closing `}` of `api` at line 146), add:

```ts
  webhook: {
    send: (url: string, body: unknown) =>
      ipcRenderer.invoke("webhook/send", url, body) as Promise<{
        ok: boolean;
        status: number;
        error?: string;
      }>,
  },
```

- [ ] **Step 2: Add the import in the main IPC module**

In `src/main/ipc/index.ts`, add near the existing imports at the top of the file:

```ts
import { sendWebhook } from "../integrations/webhook";
```

- [ ] **Step 3: Add the IPC handler**

In `src/main/ipc/index.ts`, immediately after the `ipcMain.handle("app/notify", …)` handler closes (after line 526), add:

```ts
ipcMain.handle("webhook/send", async (_event, url: string, body: unknown) => {
  if (typeof url !== "string" || !url) return { ok: false, status: 0, error: "Missing url" };
  return sendWebhook(url, body);
});
```

- [ ] **Step 4: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS, no errors. (`window.electronAPI.webhook` is now typed via `ElectronAPI = typeof api`.)

- [ ] **Step 5: Commit**

```bash
git add src/preload/index.ts src/main/ipc/index.ts
git commit -m "feat(alerts): expose webhook/send IPC bridge"
```

---

## Task 5: Settings schema (7 webhook keys)

**Files:**

- Modify: `src/shared/settingsSchema.ts:119` (insert after `alertsNewDrops`, before `enableBadgesEmotes`)
- Modify: `src/shared/settingsSchema.test.ts` (defaults object + key-order array)
- Modify: `src/shared/settingsSchema.characterization.test.ts` (full-settings expectations)

- [ ] **Step 1: Update the tests first (failing)**

In `src/shared/settingsSchema.test.ts`, in the `SETTINGS_DEFAULTS` expectation object, insert after `alertsNewDrops: true,` (line 109):

```ts
      webhookEnabled: false,
      webhookUrl: "",
      webhookDropClaimed: true,
      webhookWatchError: true,
      webhookDropEndingSoon: false,
      webhookAutoSwitch: false,
      webhookNewDrops: false,
```

And in the same file's key-order array, insert after `"alertsNewDrops",` (line 170):

```ts
      "webhookEnabled",
      "webhookUrl",
      "webhookDropClaimed",
      "webhookWatchError",
      "webhookDropEndingSoon",
      "webhookAutoSwitch",
      "webhookNewDrops",
```

In `src/shared/settingsSchema.characterization.test.ts`, find EVERY full-settings expectation object (each ends with `windowBounds: undefined,`) and insert the same 7 lines after its `alertsNewDrops: true,` line:

```ts
      webhookEnabled: false,
      webhookUrl: "",
      webhookDropClaimed: true,
      webhookWatchError: true,
      webhookDropEndingSoon: false,
      webhookAutoSwitch: false,
      webhookNewDrops: false,
```

(These keys have no legacy counterpart — they are net-new settings, so extending the "legacy equivalence" full-object fixtures is correct, not a papered-over expectation.)

- [ ] **Step 2: Run the schema tests to verify they fail**

Run: `npx vitest run src/shared/settingsSchema.test.ts src/shared/settingsSchema.characterization.test.ts`
Expected: FAIL — actual objects are missing the 7 webhook keys.

- [ ] **Step 3: Add the schema descriptors**

In `src/shared/settingsSchema.ts`, inside `SETTINGS_SCHEMA`, insert after `alertsNewDrops: bool(true),` (line 119) and before `enableBadgesEmotes: bool(false),`:

```ts
  webhookEnabled: bool(false),
  webhookUrl: stringWithDefault(""),
  webhookDropClaimed: bool(true),
  webhookWatchError: bool(true),
  webhookDropEndingSoon: bool(false),
  webhookAutoSwitch: bool(false),
  webhookNewDrops: bool(false),
```

- [ ] **Step 4: Run the schema tests to verify they pass**

Run: `npx vitest run src/shared/settingsSchema.test.ts src/shared/settingsSchema.characterization.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/settingsSchema.ts src/shared/settingsSchema.test.ts src/shared/settingsSchema.characterization.test.ts
git commit -m "feat(alerts): add webhook settings to schema"
```

---

## Task 6: Renderer settings store threading

**Files:**

- Modify: `src/renderer/shared/hooks/app/useSettingsStore.ts`

Default semantics mirror the schema: `webhookEnabled`/`webhookDropEndingSoon`/`webhookAutoSwitch`/`webhookNewDrops` default `false` (read with `=== true`); `webhookDropClaimed`/`webhookWatchError` default `true` (read with `!== false`); `webhookUrl` default `""`.

- [ ] **Step 1: Extend the `SettingsData` type**

In `src/renderer/shared/hooks/app/useSettingsStore.ts`, in the `SettingsData` type, after `alertsNewDrops?: boolean;` (line 32) add:

```ts
  webhookEnabled?: boolean;
  webhookUrl?: string;
  webhookDropClaimed?: boolean;
  webhookWatchError?: boolean;
  webhookDropEndingSoon?: boolean;
  webhookAutoSwitch?: boolean;
  webhookNewDrops?: boolean;
```

- [ ] **Step 2: Extend the `SettingsHook` type**

After `alertsNewDrops: boolean;` (line 60) add:

```ts
webhookEnabled: boolean;
webhookUrl: string;
webhookDropClaimed: boolean;
webhookWatchError: boolean;
webhookDropEndingSoon: boolean;
webhookAutoSwitch: boolean;
webhookNewDrops: boolean;
```

After `saveAlertsNewDrops: (val: boolean) => Promise<void>;` (line 84) add:

```ts
saveWebhookEnabled: (val: boolean) => Promise<void>;
saveWebhookUrl: (val: string) => Promise<void>;
saveWebhookDropClaimed: (val: boolean) => Promise<void>;
saveWebhookWatchError: (val: boolean) => Promise<void>;
saveWebhookDropEndingSoon: (val: boolean) => Promise<void>;
saveWebhookAutoSwitch: (val: boolean) => Promise<void>;
saveWebhookNewDrops: (val: boolean) => Promise<void>;
```

- [ ] **Step 3: Add `useState` declarations**

After `const [alertsNewDrops, setAlertsNewDrops] = useState<boolean>(true);` (line 145) add:

```ts
const [webhookEnabled, setWebhookEnabled] = useState<boolean>(false);
const [webhookUrl, setWebhookUrl] = useState<string>("");
const [webhookDropClaimed, setWebhookDropClaimed] = useState<boolean>(true);
const [webhookWatchError, setWebhookWatchError] = useState<boolean>(true);
const [webhookDropEndingSoon, setWebhookDropEndingSoon] = useState<boolean>(false);
const [webhookAutoSwitch, setWebhookAutoSwitch] = useState<boolean>(false);
const [webhookNewDrops, setWebhookNewDrops] = useState<boolean>(false);
```

- [ ] **Step 4: Hydrate in `loadSettings`, `persist`, and `importSettings`**

This exact block must be added in THREE places — after `setAlertsNewDrops(res.alertsNewDrops !== false);` in `loadSettings` (line 184), after `setAlertsNewDrops(saved.alertsNewDrops !== false);` in `persist` (line 228), and after `setAlertsNewDrops(saved.alertsNewDrops !== false);` in `importSettings` (line 433). Use `res` in `loadSettings` and `saved` in the other two:

```ts
// loadSettings (source = res):
setWebhookEnabled(res.webhookEnabled === true);
setWebhookUrl(typeof res.webhookUrl === "string" ? res.webhookUrl : "");
setWebhookDropClaimed(res.webhookDropClaimed !== false);
setWebhookWatchError(res.webhookWatchError !== false);
setWebhookDropEndingSoon(res.webhookDropEndingSoon === true);
setWebhookAutoSwitch(res.webhookAutoSwitch === true);
setWebhookNewDrops(res.webhookNewDrops === true);
```

```ts
// persist AND importSettings (source = saved):
setWebhookEnabled(saved.webhookEnabled === true);
setWebhookUrl(typeof saved.webhookUrl === "string" ? saved.webhookUrl : "");
setWebhookDropClaimed(saved.webhookDropClaimed !== false);
setWebhookWatchError(saved.webhookWatchError !== false);
setWebhookDropEndingSoon(saved.webhookDropEndingSoon === true);
setWebhookAutoSwitch(saved.webhookAutoSwitch === true);
setWebhookNewDrops(saved.webhookNewDrops === true);
```

- [ ] **Step 5: Add the `saveX` functions**

After `saveAlertsNewDrops` (line 340) add:

```ts
const saveWebhookEnabled = async (val: boolean) => {
  setWebhookEnabled(val);
  await persist({ webhookEnabled: val });
};

const saveWebhookUrl = async (val: string) => {
  setWebhookUrl(val);
  await persist({ webhookUrl: val });
};

const saveWebhookDropClaimed = async (val: boolean) => {
  setWebhookDropClaimed(val);
  await persist({ webhookDropClaimed: val });
};

const saveWebhookWatchError = async (val: boolean) => {
  setWebhookWatchError(val);
  await persist({ webhookWatchError: val });
};

const saveWebhookDropEndingSoon = async (val: boolean) => {
  setWebhookDropEndingSoon(val);
  await persist({ webhookDropEndingSoon: val });
};

const saveWebhookAutoSwitch = async (val: boolean) => {
  setWebhookAutoSwitch(val);
  await persist({ webhookAutoSwitch: val });
};

const saveWebhookNewDrops = async (val: boolean) => {
  setWebhookNewDrops(val);
  await persist({ webhookNewDrops: val });
};
```

- [ ] **Step 6: Extend the returned object**

In the `return { … }` (after `alertsNewDrops,` ~line 476) add the 7 values, and after `saveAlertsNewDrops,` (~line 499) add the 7 save fns:

```ts
    // values (after alertsNewDrops,)
    webhookEnabled,
    webhookUrl,
    webhookDropClaimed,
    webhookWatchError,
    webhookDropEndingSoon,
    webhookAutoSwitch,
    webhookNewDrops,
```

```ts
    // save fns (after saveAlertsNewDrops,)
    saveWebhookEnabled,
    saveWebhookUrl,
    saveWebhookDropClaimed,
    saveWebhookWatchError,
    saveWebhookDropEndingSoon,
    saveWebhookAutoSwitch,
    saveWebhookNewDrops,
```

- [ ] **Step 7: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS. (`SettingsHook` now satisfied by the return object.)

- [ ] **Step 8: Commit**

```bash
git add src/renderer/shared/hooks/app/useSettingsStore.ts
git commit -m "feat(alerts): thread webhook settings through the store"
```

---

## Task 7: Settings action handlers

**Files:**

- Modify: `src/renderer/shared/hooks/app/useSettingsActions.ts`
- Modify: `src/renderer/shared/hooks/app/useAppActions.ts`

- [ ] **Step 1: Extend `useSettingsActions` Params + destructure**

In `src/renderer/shared/hooks/app/useSettingsActions.ts`, in the `Params` type after `saveAlertsNewDrops: (val: boolean) => Promise<void>;` (line 22) add:

```ts
saveWebhookEnabled: (val: boolean) => Promise<void>;
saveWebhookUrl: (val: string) => Promise<void>;
saveWebhookDropClaimed: (val: boolean) => Promise<void>;
saveWebhookWatchError: (val: boolean) => Promise<void>;
saveWebhookDropEndingSoon: (val: boolean) => Promise<void>;
saveWebhookAutoSwitch: (val: boolean) => Promise<void>;
saveWebhookNewDrops: (val: boolean) => Promise<void>;
```

And in the destructured params after `saveAlertsNewDrops,` (line 48) add the same 7 names (without types):

```ts
  saveWebhookEnabled,
  saveWebhookUrl,
  saveWebhookDropClaimed,
  saveWebhookWatchError,
  saveWebhookDropEndingSoon,
  saveWebhookAutoSwitch,
  saveWebhookNewDrops,
```

- [ ] **Step 2: Add the handlers**

After `handleSetAlertsNewDrops` (line 168) add:

```ts
const handleSetWebhookEnabled = useCallback(
  (val: boolean) => {
    void saveWebhookEnabled(val);
  },
  [saveWebhookEnabled],
);

const handleSetWebhookUrl = useCallback(
  (val: string) => {
    void saveWebhookUrl(val);
  },
  [saveWebhookUrl],
);

const handleSetWebhookDropClaimed = useCallback(
  (val: boolean) => {
    void saveWebhookDropClaimed(val);
  },
  [saveWebhookDropClaimed],
);

const handleSetWebhookWatchError = useCallback(
  (val: boolean) => {
    void saveWebhookWatchError(val);
  },
  [saveWebhookWatchError],
);

const handleSetWebhookDropEndingSoon = useCallback(
  (val: boolean) => {
    void saveWebhookDropEndingSoon(val);
  },
  [saveWebhookDropEndingSoon],
);

const handleSetWebhookAutoSwitch = useCallback(
  (val: boolean) => {
    void saveWebhookAutoSwitch(val);
  },
  [saveWebhookAutoSwitch],
);

const handleSetWebhookNewDrops = useCallback(
  (val: boolean) => {
    void saveWebhookNewDrops(val);
  },
  [saveWebhookNewDrops],
);
```

- [ ] **Step 3: Return the handlers**

In the `return { … }` after `handleSetAlertsNewDrops,` (line 225) add:

```ts
    handleSetWebhookEnabled,
    handleSetWebhookUrl,
    handleSetWebhookDropClaimed,
    handleSetWebhookWatchError,
    handleSetWebhookDropEndingSoon,
    handleSetWebhookAutoSwitch,
    handleSetWebhookNewDrops,
```

- [ ] **Step 4: Thread save fns through `useAppActions`**

In `src/renderer/shared/hooks/app/useAppActions.ts`: in the `Params` type after `saveAlertsNewDrops: (val: boolean) => Promise<void>;` (line 31) add the same 7 save-fn type lines from Task 7 Step 1. In the destructured params after `saveAlertsNewDrops,` (line 70) add the 7 names. In the `useSettingsActions({ … })` call after `saveAlertsNewDrops,` (line 123) add the 7 names again:

```ts
    saveWebhookEnabled,
    saveWebhookUrl,
    saveWebhookDropClaimed,
    saveWebhookWatchError,
    saveWebhookDropEndingSoon,
    saveWebhookAutoSwitch,
    saveWebhookNewDrops,
```

- [ ] **Step 5: Pass the save fns from `useAppModel` (keeps this task's compile green)**

`useAppActions` now _requires_ the 7 save fns, so `useAppModel` must supply them in the same commit. In `src/renderer/shared/hooks/app/useAppModel.ts`: in the `useSettingsStore()` destructure, after `saveAlertsNewDrops,` (line 95) add the 7 save-fn names; and in the `useAppActions({ … })` call, after `saveAlertsNewDrops,` (line 270) add the 7 names again:

```ts
    saveWebhookEnabled,
    saveWebhookUrl,
    saveWebhookDropClaimed,
    saveWebhookWatchError,
    saveWebhookDropEndingSoon,
    saveWebhookAutoSwitch,
    saveWebhookNewDrops,
```

(Destructure ONLY the save fns here — the webhook _values_ are destructured in Task 9 where they are first used, to avoid an unused-locals error.)

- [ ] **Step 6: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS. (Handlers are returned-but-unused — that is allowed; only unused _locals_ error. The webhook values are not destructured yet.)

- [ ] **Step 7: Commit**

```bash
git add src/renderer/shared/hooks/app/useSettingsActions.ts src/renderer/shared/hooks/app/useAppActions.ts src/renderer/shared/hooks/app/useAppModel.ts
git commit -m "feat(alerts): webhook setting action handlers"
```

---

## Task 8: Per-channel dispatch in useSmartAlerts

**Files:**

- Modify: `src/renderer/shared/hooks/app/useSmartAlerts.ts` (full rewrite)

This makes `notify` route to OS and/or webhook via `resolveAlertTargets`, with a separate dedupe map per channel. `notify` becomes stable (`[]` deps) by reading config from a ref — a deliberate change so a settings toggle no longer re-runs producer effects (notifications still only fire on data changes). Webhook timestamps are stamped at dispatch.

- [ ] **Step 1: Rewrite the hook**

Replace the entire contents of `src/renderer/shared/hooks/app/useSmartAlerts.ts` with:

```ts
import { useCallback, useRef } from "react";
import {
  resolveAlertTargets,
  type AlertChannelToggles,
  type AlertEventType,
} from "@renderer/shared/domain/alerts/alertRouting";
import { buildDiscordPayload } from "@renderer/shared/domain/alerts/discordPayload";

export type SmartAlertsConfig = {
  alertsEnabled: boolean;
  notifyWhileFocused: boolean;
  osToggles: AlertChannelToggles;
  webhookEnabled: boolean;
  webhookUrl: string;
  webhookToggles: AlertChannelToggles;
};

type AlertPayload = {
  /** Omitted only for the forced OS test alert. */
  type?: AlertEventType;
  key: string;
  title: string;
  body?: string;
  dedupeMs?: number;
  force?: boolean;
};

/** Returns true (and records the send) when the key is outside its dedupe window. */
function passesDedupe(
  map: Map<string, number>,
  key: string,
  dedupeMs: number,
  now: number,
): boolean {
  const last = map.get(key) ?? 0;
  if (dedupeMs > 0 && now - last < dedupeMs) return false;
  map.set(key, now);
  return true;
}

export function useSmartAlerts(config: SmartAlertsConfig) {
  const configRef = useRef(config);
  configRef.current = config;
  const osLastSent = useRef(new Map<string, number>());
  const webhookLastSent = useRef(new Map<string, number>());

  const notify = useCallback((payload: AlertPayload) => {
    const cfg = configRef.current;
    const now = Date.now();
    const dedupeMs = payload.dedupeMs ?? 60_000;

    // Forced OS test alert: OS only, bypass routing + focus (keeps existing behavior).
    if (payload.force) {
      if (passesDedupe(osLastSent.current, payload.key, dedupeMs, now)) {
        void window.electronAPI?.app?.notify?.({ title: payload.title, body: payload.body });
      }
      return;
    }
    if (!payload.type) return;

    const focused = typeof document === "undefined" ? true : document.hasFocus();
    const targets = resolveAlertTargets(payload.type, {
      alertsEnabled: cfg.alertsEnabled,
      notifyWhileFocused: cfg.notifyWhileFocused,
      focused,
      osToggles: cfg.osToggles,
      webhookEnabled: cfg.webhookEnabled,
      webhookUrlSet: Boolean(cfg.webhookUrl),
      webhookToggles: cfg.webhookToggles,
    });

    if (targets.os && passesDedupe(osLastSent.current, payload.key, dedupeMs, now)) {
      void window.electronAPI?.app?.notify?.({ title: payload.title, body: payload.body });
    }

    if (targets.webhook && passesDedupe(webhookLastSent.current, payload.key, dedupeMs, now)) {
      const discordBody = buildDiscordPayload({
        type: payload.type,
        title: payload.title,
        body: payload.body,
        timestampIso: new Date(now).toISOString(),
      });
      void window.electronAPI?.webhook?.send?.(cfg.webhookUrl, discordBody);
    }
  }, []);

  return { notify };
}
```

- [ ] **Step 2: Do NOT run the full typecheck yet**

This rewrite is the first edit of the **Tasks 8–11 compile unit** (see the _Compile-unit note_ near the top of this plan). `npm run typecheck` will report errors until Task 11 lands, because callers still use the old `useSmartAlerts({ enabled, notifyWhileFocused })` shape. That is expected. Verify this step by re-reading the rewritten file against the exported signatures from Task 1 (`resolveAlertTargets`, `AlertChannelToggles`, `AlertEventType`) and Task 2 (`buildDiscordPayload`) — they must match.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/shared/hooks/app/useSmartAlerts.ts
git commit -m "feat(alerts): per-channel dispatch in useSmartAlerts"
```

---

## Task 9: Pass `type` from producers + wire dispatcher config

**Files:**

- Modify: `src/renderer/shared/hooks/inventory/useDropClaimAlerts.ts`
- Modify: `src/renderer/shared/hooks/app/useAlertEffects.ts`
- Modify: `src/renderer/shared/hooks/app/useAppModel.ts`

- [ ] **Step 1: Update `useDropClaimAlerts`**

In `src/renderer/shared/hooks/inventory/useDropClaimAlerts.ts`: add the import, extend `NotifyFn` with `type`, remove the `alertsDropClaimed` param + its gate, and tag the notify call. Replace the file's `NotifyFn`, `Params`, and `useDropClaimAlerts` with:

```ts
import { useCallback } from "react";
import type { Language } from "@renderer/shared/i18n";
import { translate } from "@renderer/shared/i18n";
import { recordActivity } from "@renderer/shared/utils/activityFeed";
import type { ActivityEvent } from "@renderer/shared/utils/activityFeed";
import type { AlertEventType } from "@renderer/shared/domain/alerts/alertRouting";

type NotifyFn = (payload: {
  type?: AlertEventType;
  key: string;
  title: string;
  body?: string;
  dedupeMs?: number;
  force?: boolean;
}) => void;

type Params = {
  language: Language;
  notify: NotifyFn;
  bumpStats: (delta: { claims?: number; lastDropTitle?: string; lastGame?: string }) => void;
};

export function useDropClaimAlerts({ language, notify, bumpStats }: Params) {
  const handleDropClaimed = useCallback(
    ({ title, game }: { title: string; game: string }) => {
      bumpStats({ claims: 1, lastDropTitle: title, lastGame: game });
      recordActivity({ kind: "drop-claimed", at: Date.now(), title, game } as Omit<
        Extract<ActivityEvent, { kind: "drop-claimed" }>,
        "id"
      >);
      notify({
        type: "drop-claimed",
        key: `drop-claimed:${title}:${game}`,
        title: translate(language, "alerts.title.dropClaimed"),
        body: translate(language, "alerts.body.dropClaimed", { title, game }),
        dedupeMs: 60_000,
      });
    },
    [bumpStats, language, notify],
  );

  const handleTestAlert = useCallback(() => {
    notify({
      key: "test-alert",
      title: translate(language, "alerts.title.test"),
      body: translate(language, "alerts.body.test"),
      dedupeMs: 0,
      force: true,
    });
  }, [language, notify]);

  return { handleDropClaimed, handleTestAlert };
}
```

- [ ] **Step 2: Update `useAlertEffects`**

In `src/renderer/shared/hooks/app/useAlertEffects.ts`:

(a) Add the import after the other imports:

```ts
import type { AlertEventType } from "@renderer/shared/domain/alerts/alertRouting";
```

(b) Extend the `NotifyFn` type with `type?: AlertEventType;` as the first field (matching Task 9 Step 1's shape).

(c) Remove these four fields from the `Params` type and from the destructured params: `alertsNewDrops`, `alertsWatchError`, `alertsAutoSwitch`, `alertsDropEndingSoon`. KEEP `alertsDropEndingMinutes`.

(d) In the new-drops effect, delete the line `if (!alertsNewDrops) return;`, add `type: "new-drops",` as the first field of its `notify({...})` call, and remove `alertsNewDrops` from that effect's dependency array.

(e) In the watch-error effect, delete `if (!alertsWatchError) return;`, add `type: "watch-error",` to its `notify` call, and remove `alertsWatchError` from its deps.

(f) In the auto-switch effect, delete `if (!alertsAutoSwitch) return;`, add `type: "auto-switch",` to its `notify` call, and remove `alertsAutoSwitch` from its deps.

(g) In the drop-ending-soon effect, delete `if (!alertsDropEndingSoon) return;`, add `type: "drop-ending-soon",` to its `notify` call, and remove `alertsDropEndingSoon` from its deps (keep `alertsDropEndingMinutes`).

The resulting effects (for reference, the new-drops and watch-error ones):

```ts
useEffect(() => {
  if (inventory.status !== "ready") return;
  if (!inventoryAlertReadyRef.current) {
    inventoryAlertReadyRef.current = true;
    return;
  }
  if (inventoryChanges.added.size === 0) return;
  const addedItems = inventoryItems.filter((item) => inventoryChanges.added.has(item.id));
  if (addedItems.length === 0) return;
  const games = Array.from(new Set(addedItems.map((item) => item.game).filter(Boolean)));
  const gameLabel = (() => {
    if (!games.length) return translate(language, "alerts.misc.multipleGames");
    const main = games.slice(0, 2).join(", ");
    const extra = games.length - 2;
    return extra > 0 ? `${main} +${extra}` : main;
  })();
  notify({
    type: "new-drops",
    key: `new-drops:${games.join("|")}:${addedItems.length}`,
    title: translate(language, "alerts.title.newDrops"),
    body: translate(language, "alerts.body.newDrops", {
      count: addedItems.length,
      games: gameLabel,
    }),
    dedupeMs: 30_000,
  });
}, [inventory.status, inventoryChanges.added, inventoryItems, language, notify]);

useEffect(() => {
  if (!watchStats.lastError) return;
  const t = (key: string, vars?: Record<string, string | number>) => translate(language, key, vars);
  const message = resolveErrorMessage(t, watchStats.lastError);
  notify({
    type: "watch-error",
    key: `watch-error:${watchStats.lastError.code ?? message}`,
    title: translate(language, "alerts.title.watchError"),
    body: translate(language, "alerts.body.watchError", { message }),
    dedupeMs: 10 * 60_000,
  });
}, [language, notify, watchStats.lastError]);
```

- [ ] **Step 3: Update the `useSmartAlerts` call in `useAppModel`**

In `src/renderer/shared/hooks/app/useAppModel.ts`, replace the `useSmartAlerts({ … })` call (lines 170-173) with:

```ts
const { notify } = useSmartAlerts({
  alertsEnabled,
  notifyWhileFocused: alertsNotifyWhileFocused,
  osToggles: {
    "drop-claimed": alertsDropClaimed,
    "drop-ending-soon": alertsDropEndingSoon,
    "watch-error": alertsWatchError,
    "auto-switch": alertsAutoSwitch,
    "new-drops": alertsNewDrops,
  },
  webhookEnabled,
  webhookUrl,
  webhookToggles: {
    "drop-claimed": webhookDropClaimed,
    "drop-ending-soon": webhookDropEndingSoon,
    "watch-error": webhookWatchError,
    "auto-switch": webhookAutoSwitch,
    "new-drops": webhookNewDrops,
  },
});
```

- [ ] **Step 4: Update the `useDropClaimAlerts` call in `useAppModel`**

Replace lines 174-179 with (remove `alertsDropClaimed`):

```ts
const { handleDropClaimed, handleTestAlert } = useDropClaimAlerts({
  language,
  notify,
  bumpStats,
});
```

- [ ] **Step 5: Update the `useAlertEffects` call in `useAppModel`**

In the `useAlertEffects({ … })` call (line 435), remove the four lines `alertsNewDrops,`, `alertsWatchError,`, `alertsAutoSwitch,`, `alertsDropEndingSoon,` (lines 438-441). KEEP `alertsDropEndingMinutes,`.

- [ ] **Step 6: Destructure the 7 webhook _values_ from `useSettingsStore`**

(The save fns were already destructured + threaded in Task 7. Here add only the values, which are now consumed by Steps 3 and 7.) In `useAppModel`, in the `useSettingsStore()` destructure, after `alertsNewDrops,` (line 71) add:

```ts
    webhookEnabled,
    webhookUrl,
    webhookDropClaimed,
    webhookWatchError,
    webhookDropEndingSoon,
    webhookAutoSwitch,
    webhookNewDrops,
```

- [ ] **Step 7: Expose webhook state + setters in `settingsProps`**

In the `settingsProps` object, after `setAlertsNewDrops: actions.handleSetAlertsNewDrops,` (line 671) add:

```ts
    webhookEnabled,
    setWebhookEnabled: actions.handleSetWebhookEnabled,
    webhookUrl,
    setWebhookUrl: actions.handleSetWebhookUrl,
    webhookDropClaimed,
    setWebhookDropClaimed: actions.handleSetWebhookDropClaimed,
    webhookWatchError,
    setWebhookWatchError: actions.handleSetWebhookWatchError,
    webhookDropEndingSoon,
    setWebhookDropEndingSoon: actions.handleSetWebhookDropEndingSoon,
    webhookAutoSwitch,
    setWebhookAutoSwitch: actions.handleSetWebhookAutoSwitch,
    webhookNewDrops,
    setWebhookNewDrops: actions.handleSetWebhookNewDrops,
```

- [ ] **Step 8: Verify the remaining errors are ONLY the expected compile-unit ones**

Run: `npm run typecheck`
Expected: the ONLY remaining errors are in `SettingsView.tsx` / `AlertsSection.tsx` (they don't yet declare the webhook props that `settingsProps` now carries via `ComponentProps<typeof SettingsView>`). These are resolved in Task 11. There must be NO errors in `useSmartAlerts.ts`, `useDropClaimAlerts.ts`, `useAlertEffects.ts`, or the non-UI parts of `useAppModel.ts` — if there are, fix them before committing.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/shared/hooks/inventory/useDropClaimAlerts.ts src/renderer/shared/hooks/app/useAlertEffects.ts src/renderer/shared/hooks/app/useAppModel.ts
git commit -m "feat(alerts): tag alert events with type and wire dispatcher config"
```

---

## Task 10: i18n keys (EN + DE)

**Files:**

- Modify: `src/renderer/shared/i18n.tsx`

Add every key to BOTH the English block and the German block. The per-event toggle names reuse the existing `settings.row.alertsX.label`/`.description` keys — do NOT duplicate those.

- [ ] **Step 1: Add the English keys**

In the EN dictionary, after `"settings.subsection.engine": "engine",` (line 640) add:

```ts
    "settings.subsection.webhook": "discord / webhook",
```

After `"alerts.body.test": "This is a test from DropPilot.",` (line 826) add:

```ts
    "settings.row.webhookEnabled.label": "Enable webhook",
    "settings.row.webhookEnabled.description":
      "Send alerts to a Discord webhook (or compatible). Independent of desktop notifications.",
    "settings.row.webhookUrl.label": "Webhook URL",
    "settings.row.webhookUrl.description": "Paste a Discord webhook URL (https only).",
    "settings.row.webhookUrl.placeholder": "https://discord.com/api/webhooks/…",
    "settings.row.webhookTest.description": "Send a test message to verify the webhook.",
    "settings.action.webhookTest": "Send test",
    "settings.webhook.testOk": "Sent ✓",
    "settings.webhook.testFailed": "Failed: {error}",
    "settings.webhook.testNoUrl": "Enter a webhook URL first.",
```

- [ ] **Step 2: Add the German keys**

In the DE dictionary, after `"settings.subsection.engine": "engine",` (line 1668) add:

```ts
    "settings.subsection.webhook": "discord / webhook",
```

After `"alerts.body.test": "Das ist ein Test von DropPilot.",` (line 1848) add:

```ts
    "settings.row.webhookEnabled.label": "Webhook aktivieren",
    "settings.row.webhookEnabled.description":
      "Sende Benachrichtigungen an einen Discord-Webhook (oder kompatibel). Unabhängig von Desktop-Benachrichtigungen.",
    "settings.row.webhookUrl.label": "Webhook-URL",
    "settings.row.webhookUrl.description": "Discord-Webhook-URL einfügen (nur https).",
    "settings.row.webhookUrl.placeholder": "https://discord.com/api/webhooks/…",
    "settings.row.webhookTest.description": "Sende eine Testnachricht zur Überprüfung des Webhooks.",
    "settings.action.webhookTest": "Test senden",
    "settings.webhook.testOk": "Gesendet ✓",
    "settings.webhook.testFailed": "Fehlgeschlagen: {error}",
    "settings.webhook.testNoUrl": "Erst eine Webhook-URL eingeben.",
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/shared/i18n.tsx
git commit -m "feat(alerts): i18n keys for webhook settings (en+de)"
```

---

## Task 11: Settings UI — webhook subsection + test button

**Files:**

- Modify: `src/renderer/features/settings/SettingsView.tsx`
- Modify: `src/renderer/features/settings/sections/AlertsSection.tsx`

- [ ] **Step 1: Add the 14 props to `SettingsView`'s `SettingsProps`**

In `src/renderer/features/settings/SettingsView.tsx`, in `SettingsProps` after `setAlertsNewDrops: (val: boolean) => void;` (line 58) add:

```ts
  webhookEnabled: boolean;
  setWebhookEnabled: (val: boolean) => void;
  webhookUrl: string;
  setWebhookUrl: (val: string) => void;
  webhookDropClaimed: boolean;
  setWebhookDropClaimed: (val: boolean) => void;
  webhookWatchError: boolean;
  setWebhookWatchError: (val: boolean) => void;
  webhookDropEndingSoon: boolean;
  setWebhookDropEndingSoon: (val: boolean) => void;
  webhookAutoSwitch: boolean;
  setWebhookAutoSwitch: (val: boolean) => void;
  webhookNewDrops: boolean;
  setWebhookNewDrops: (val: boolean) => void;
```

- [ ] **Step 2: Pass them to `<AlertsSection>`**

In the `<AlertsSection … />` JSX, after `setAlertsNewDrops={props.setAlertsNewDrops}` (line 214) add:

```tsx
              webhookEnabled={props.webhookEnabled}
              setWebhookEnabled={props.setWebhookEnabled}
              webhookUrl={props.webhookUrl}
              setWebhookUrl={props.setWebhookUrl}
              webhookDropClaimed={props.webhookDropClaimed}
              setWebhookDropClaimed={props.setWebhookDropClaimed}
              webhookWatchError={props.webhookWatchError}
              setWebhookWatchError={props.setWebhookWatchError}
              webhookDropEndingSoon={props.webhookDropEndingSoon}
              setWebhookDropEndingSoon={props.setWebhookDropEndingSoon}
              webhookAutoSwitch={props.webhookAutoSwitch}
              setWebhookAutoSwitch={props.setWebhookAutoSwitch}
              webhookNewDrops={props.webhookNewDrops}
              setWebhookNewDrops={props.setWebhookNewDrops}
```

- [ ] **Step 3: Extend `AlertsSection` props + imports**

In `src/renderer/features/settings/sections/AlertsSection.tsx`:

(a) Add imports after the existing imports (line 6):

```ts
import { Button } from "@renderer/shared/components/ui/button";
import { buildDiscordPayload } from "@renderer/shared/domain/alerts/discordPayload";
```

(b) In `AlertsSectionProps` after `setAlertsNewDrops: (val: boolean) => void;` (line 24) add the 14 webhook prop types from Task 11 Step 1.

- [ ] **Step 4: Add the test handler + local status state**

Inside `AlertsSection`, after `const disabledByMaster = !props.alertsEnabled;` (line 29) add:

```ts
const [webhookTestStatus, setWebhookTestStatus] = React.useState<string | null>(null);
const handleWebhookTest = async () => {
  if (!props.webhookUrl) {
    setWebhookTestStatus(t("settings.webhook.testNoUrl"));
    return;
  }
  const body = buildDiscordPayload({
    type: "drop-claimed",
    title: t("alerts.title.test"),
    body: t("alerts.body.test"),
    timestampIso: new Date().toISOString(),
  });
  const res = await window.electronAPI.webhook.send(props.webhookUrl, body);
  setWebhookTestStatus(
    res.ok
      ? t("settings.webhook.testOk")
      : t("settings.webhook.testFailed", {
          error: res.error ?? `http-${res.status}`,
        }),
  );
};
```

- [ ] **Step 5: Add the webhook subsection JSX**

After the engine subsection's closing `</div>` (line 146) and before the component's outer closing `</div>` (line 147), add:

```tsx
<div className="mt-6">
  <SectionLabel>{t("settings.subsection.webhook")}</SectionLabel>
  <SettingRow
    label={t("settings.row.webhookEnabled.label")}
    description={t("settings.row.webhookEnabled.description")}
    control={<SettingsToggle checked={props.webhookEnabled} onChange={props.setWebhookEnabled} />}
  />
  <SettingRow
    divided
    disabled={!props.webhookEnabled}
    label={t("settings.row.webhookUrl.label")}
    description={t("settings.row.webhookUrl.description")}
    control={
      <Input
        tone="dp"
        type="url"
        value={props.webhookUrl}
        onChange={(e) => props.setWebhookUrl(e.target.value)}
        placeholder={t("settings.row.webhookUrl.placeholder")}
        disabled={!props.webhookEnabled}
        aria-label={t("settings.row.webhookUrl.label")}
        className="w-72"
      />
    }
  />
  <SettingRow
    divided
    disabled={!props.webhookEnabled}
    label={t("settings.action.webhookTest")}
    description={webhookTestStatus ?? t("settings.row.webhookTest.description")}
    control={
      <Button
        variant="dp-secondary"
        size="dp-md"
        onClick={() => void handleWebhookTest()}
        disabled={!props.webhookEnabled || !props.webhookUrl}
      >
        {t("settings.action.webhookTest")}
      </Button>
    }
  />
  <SettingRow
    divided
    disabled={!props.webhookEnabled}
    label={t("settings.row.alertsDropClaimed.label")}
    description={t("settings.row.alertsDropClaimed.description")}
    control={
      <SettingsToggle
        checked={props.webhookDropClaimed}
        onChange={props.setWebhookDropClaimed}
        disabled={!props.webhookEnabled}
      />
    }
  />
  <SettingRow
    divided
    disabled={!props.webhookEnabled}
    label={t("settings.row.alertsWatchError.label")}
    description={t("settings.row.alertsWatchError.description")}
    control={
      <SettingsToggle
        checked={props.webhookWatchError}
        onChange={props.setWebhookWatchError}
        disabled={!props.webhookEnabled}
      />
    }
  />
  <SettingRow
    divided
    disabled={!props.webhookEnabled}
    label={t("settings.row.alertsDropEndingSoon.label")}
    description={t("settings.row.alertsDropEndingSoon.description")}
    control={
      <SettingsToggle
        checked={props.webhookDropEndingSoon}
        onChange={props.setWebhookDropEndingSoon}
        disabled={!props.webhookEnabled}
      />
    }
  />
  <SettingRow
    divided
    disabled={!props.webhookEnabled}
    label={t("settings.row.alertsAutoSwitch.label")}
    description={t("settings.row.alertsAutoSwitch.description")}
    control={
      <SettingsToggle
        checked={props.webhookAutoSwitch}
        onChange={props.setWebhookAutoSwitch}
        disabled={!props.webhookEnabled}
      />
    }
  />
  <SettingRow
    divided
    disabled={!props.webhookEnabled}
    label={t("settings.row.alertsNewDrops.label")}
    description={t("settings.row.alertsNewDrops.description")}
    control={
      <SettingsToggle
        checked={props.webhookNewDrops}
        onChange={props.setWebhookNewDrops}
        disabled={!props.webhookEnabled}
      />
    }
  />
</div>
```

- [ ] **Step 6: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS (both tsconfigs clean — this resolves the SettingsView gap from Task 9 Step 9).

- [ ] **Step 7: Format + commit**

```bash
npm run format
git add src/renderer/features/settings/SettingsView.tsx src/renderer/features/settings/sections/AlertsSection.tsx
git commit -m "feat(alerts): webhook settings UI with test button"
```

---

## Task 12: Full verification + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — all suites green, including the three new test files and the updated schema tests.

- [ ] **Step 2: Typecheck (both configs)**

Run: `npm run typecheck`
Expected: PASS, no errors.

- [ ] **Step 3: Format gate**

Run: `npm run format:check`
Expected: PASS (clean). If it fails, run `npm run format` and re-commit.

- [ ] **Step 4: Manual smoke — OS notifications unchanged**

Run: `npm run dev`. In Settings → Alerts, with the OS master on, click "Send test" in General (the existing OS test) and confirm an OS notification still appears. Toggle the OS per-event switches and confirm behavior matches pre-change (e.g. disabling "Drop claimed" suppresses the OS toast). This validates that moving gating into the dispatcher preserved OS behavior.

- [ ] **Step 5: Manual smoke — webhook**

Create a Discord channel webhook URL (Server Settings → Integrations → Webhooks → New Webhook → Copy URL). In Settings → Alerts → Discord / Webhook: enable the webhook, paste the URL, click "Send test" — confirm a green "Sent ✓" and a "DropPilot" embed in Discord. Then test failure surfacing: paste `https://discord.com/api/webhooks/000/invalid` and confirm a red "Failed: …" status. Paste `http://example.com` (non-https) and confirm "Failed: invalid-url".

- [ ] **Step 6: Manual smoke — independence**

Turn the OS master OFF and the webhook ON with only "Drop claimed" enabled on the webhook. Confirm (via the test, or by leaving it running) that webhook fires while focused and OS does not — proving focus-agnostic, OS-independent routing.

- [ ] **Step 7: Final commit (if any format/cleanup changes)**

```bash
git add -A
git commit -m "chore(alerts): verification pass for webhook alerts"
```

---

## Notes for the implementer

- **Behavior change (intentional):** `notify` is now stable (`[]` deps, config via ref). Previously toggling an alert setting changed `notify`'s identity and re-ran the producer effects. Notifications still only fire on data changes, so this is behavior-preserving for what the user sees; it just removes spurious effect re-runs.
- **Don't add webhook to the OS test alert.** The General-tab "Send test" stays OS-only (it uses `force`, no `type`). The webhook has its own test button in the Alerts tab that bypasses the dispatcher and calls `electronAPI.webhook.send` directly.
- **Defaults are "don't spam":** webhook off by default; only `drop-claimed` and `watch-error` default on once enabled.
- **`excludeGames` is unrelated** — do not touch it; it remains a documented dead key (see settings-pipeline spec).

```

```

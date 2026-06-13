# Discord / Webhook Alerts — Design

**Date:** 2026-06-13
**Branch:** `feat/discord-webhook-alerts` (based on `main` post-#58)
**Status:** Approved (brainstorming) — plan pending

## Goal

DropPilot only fires local OS notifications. People run it unattended for hours or
days, so the single most-requested capability in this tool category — "tell me it
worked without watching the window" — is missing: every actively-maintained competitor
(TwitchDropsBot, Channel-Points-Miner-v2) ships outbound webhook notifications.

Add an **outbound Discord webhook channel** alongside the existing OS notifications. All
alert events already funnel through one chokepoint (`notify()` in `useSmartAlerts.ts`),
so the work is: (1) make that dispatch route per-channel, (2) build a Discord embed
payload, (3) POST it from the main process, (4) expose settings + UI for it.

The channel is **fully independent** of the OS channel: its own master switch, its own
per-event toggles, and it is **focus-agnostic** (the whole point is a ping to your phone
while you are away — or while you sit at the same PC). This enables "Discord only, no
desktop toasts".

## Decisions (locked during brainstorming)

| Question               | Decision                                                                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target format          | **Discord embeds** only in v1. Payload built by a pure function so Slack/raw/Telegram are a trivial later add.                                                         |
| Event control          | **Independent per-event webhook toggles** (separate from the OS toggles). Lets a user route only `drop-claimed` + `watch-error` to Discord without OS-toast coupling.  |
| Channel independence   | **Fully independent.** Own master (`webhookEnabled`), focus-agnostic, independent of the OS-alerts master (`alertsEnabled`). Supports "Discord only".                  |
| Reliability            | **Single attempt** + ~10s timeout. Failure surfaced via the Test button + debug log. Discord `429` respected (read `retry-after`, return clean error). No retry in v1. |
| Routing architecture   | **Approach A — central typed dispatcher.** `notify()` gains a `type`; per-event gating moves out of the producers into a pure `resolveAlertTargets(type, config)`.     |
| Defaults               | "Don't spam": `webhookEnabled` off, only `webhookDropClaimed` + `webhookWatchError` default on; `endingSoon`/`autoSwitch`/`newDrops` default off.                      |
| URL policy             | Not hard-restricted to discord.com (Discord-compatible relays allowed). Validation = **https only** + block localhost/private hosts (basic SSRF guard).                |
| Payload build location | **Renderer** builds the Discord JSON (it owns the already-localized title/body); main is a dumb transport that validates the URL and POSTs.                            |

## Architecture

### `src/renderer/shared/domain/alerts/alertRouting.ts` (new, pure, tested)

The routing source of truth.

```ts
export type AlertEventType =
  | "drop-claimed"
  | "drop-ending-soon"
  | "watch-error"
  | "auto-switch"
  | "new-drops";

export type AlertRoutingConfig = {
  // OS channel
  alertsEnabled: boolean;
  notifyWhileFocused: boolean;
  osToggles: Record<AlertEventType, boolean>;
  focused: boolean;
  // Webhook channel
  webhookEnabled: boolean;
  webhookUrlSet: boolean;
  webhookToggles: Record<AlertEventType, boolean>;
};

export function resolveAlertTargets(
  type: AlertEventType,
  config: AlertRoutingConfig,
): { os: boolean; webhook: boolean };
```

- **OS** target: `alertsEnabled && osToggles[type] && (notifyWhileFocused || !focused)`.
  (`force` events bypass the focus gate, matching today's `force` flag — handled in the
  dispatcher, not here.)
- **Webhook** target: `webhookEnabled && webhookUrlSet && webhookToggles[type]`. No focus
  term — focus-agnostic by design.

Dedupe is **not** in this function (it is per-channel state in the dispatcher).

### `src/renderer/shared/domain/alerts/discordPayload.ts` (new, pure, tested)

```ts
export type DiscordWebhookBody = {
  username: string;
  embeds: Array<{ title: string; description?: string; color: number; timestamp: string }>;
};

export function buildDiscordPayload(event: {
  type: AlertEventType;
  title: string; // already localized
  body?: string; // already localized
  timestampIso: string;
}): DiscordWebhookBody;
```

Color per event: `drop-claimed` green `0x2ecc71`, `watch-error` red `0xe74c3c`,
`drop-ending-soon` orange `0xe67e22`, `auto-switch` blue `0x3498db`, `new-drops` violet
`0x8b5cf6` (app accent). `username: "DropPilot"`. No avatar/mentions/templates in v1.

### `src/main/integrations/webhook.ts` (new, tested)

```ts
export function isAllowedWebhookUrl(raw: string): boolean; // https + non-private host
export function sendWebhook(
  url: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; error?: string }>;
```

- `isAllowedWebhookUrl`: parses the URL, requires `https:`, rejects `localhost`,
  `*.local`, and private/loopback IP literals (`127.*`, `10.*`, `192.168.*`, `172.16–31.*`,
  `::1`, `fc00::/7`). Pure and unit-tested.
- `sendWebhook`: Node global `fetch` with an `AbortController` timeout (~10s). On HTTP
  `429`, reads `retry-after` and returns `{ ok: false, status: 429, error }` (no retry).
  Network/timeout → `{ ok: false, status: 0, error }`. `2xx` → `{ ok: true }`.

### Dispatch rework — `useSmartAlerts.ts`

`notify()` becomes channel-routing. New payload field `type: AlertEventType`. Per call:

```ts
const targets = resolveAlertTargets(type, config);
// OS: existing focus gate + existing dedupe map → window.electronAPI.app.notify
// Webhook: own dedupe map → buildDiscordPayload → window.electronAPI.webhook.send(url, body)
```

- Two dedupe maps (OS keeps current behavior; webhook gets a parallel `Map` keyed the
  same way, same `dedupeMs`).
- `force` continues to bypass the OS focus/dedupe gate as today; it does not affect the
  webhook gate (webhook has no focus gate anyway).
- The hook now also receives the webhook config + the `sendWebhook` bridge. The
  `timestampIso` for the embed is stamped at dispatch time.

### Producer change — `useAlertEffects.ts` + `useDropClaimAlerts.ts`

Each producer currently early-returns on its own `alertsX` flag, then calls `notify()`.
Change: drop the OS-only early return; always call `notify({ type, … })` once the
event's _data_ condition is met (e.g. a new `watchStats.lastError`, a claimed drop).
The dispatcher decides OS/webhook via `resolveAlertTargets`. Existing data guards and
dependency arrays are otherwise preserved. Net OS behavior is unchanged because the
dispatcher re-applies the OS toggles.

### Settings — `src/shared/settingsSchema.ts`

New descriptors (declaration order appended after the existing alert keys; the file is
the byte-serialization contract, so append, do not reorder):

```ts
webhookEnabled: bool(false),
webhookUrl: stringWithDefault(""),
webhookDropClaimed: bool(true),
webhookWatchError: bool(true),
webhookDropEndingSoon: bool(false),
webhookAutoSwitch: bool(false),
webhookNewDrops: bool(false),
```

Main load/persist **and** settings import/export are covered automatically by the schema.
Renderer threading follows the current manual pattern (verified still in place): add to
`SettingsData`/`SettingsHook` types, `useState`, the three load/reset setter sites, a
`saveX`, and the return object in `useSettingsStore.ts`; a `handleSetX` in
`useSettingsActions.ts`; threading in `useAppActions.ts` → `useAppModel.ts`; props in
`SettingsView.tsx` → `AlertsSection.tsx`. (~7 files, mechanical.)

### UI — `AlertsSection.tsx`

New subsection "Discord / Webhook" gated by `webhookEnabled` (NOT by `alertsEnabled`):

- Master toggle `webhookEnabled`.
- URL `Input` (placeholder shows the Discord webhook URL shape).
- **"Send test"** button + adjacent status text (green ok / red error) held in local
  component state; builds a sample event, calls the bridge, shows the returned status.
- Five per-event toggles (`webhookDropClaimed`, `webhookWatchError`,
  `webhookDropEndingSoon`, `webhookAutoSwitch`, `webhookNewDrops`), reusing the existing
  `settings.row.alertsX.label`/`.description` i18n keys for the event names.

### Preload / IPC

Preload `api` gains:

```ts
webhook: {
  send: (url: string, body: unknown) => ipcRenderer.invoke("webhook/send", url, body),
}
```

`ElectronAPI = typeof api` auto-types it on the renderer (no separate declaration).
Main registers `ipcMain.handle("webhook/send", (_e, url, body) => …)` near the existing
`app/notify` handler; it calls `isAllowedWebhookUrl` then `sendWebhook` and returns the
result object.

## Data flow

```
event data changes (inventory/watch/claim)
  → producer hook calls notify({ type, key, title, body, dedupeMs?, force? })
    → useSmartAlerts: resolveAlertTargets(type, config)
        ├─ os?      → focus gate + OS dedupe → electronAPI.app.notify
        └─ webhook? → webhook dedupe → buildDiscordPayload → electronAPI.webhook.send(url, body)
                        → IPC webhook/send → isAllowedWebhookUrl → sendWebhook (fetch, 10s) → Discord
```

Test button: `AlertsSection` → sample event → `buildDiscordPayload` →
`electronAPI.webhook.send` → status rendered inline.

## Testing (Vitest, pure functions only — repo convention)

- `alertRouting.test.ts`: the routing matrix — every combination of the two masters, the
  focus flag, URL-set, and per-event toggles maps to the correct `{ os, webhook }`.
- `discordPayload.test.ts`: embed shape, per-type color mapping, localized passthrough,
  optional `body` handling.
- `webhook.test.ts` (`isAllowedWebhookUrl`): https required; localhost/.local/private IP
  literals rejected; valid public https accepted. (`sendWebhook` network call itself is
  not unit-tested — thin transport.)

`npm run typecheck` (both tsconfigs) and `npm run format:check` stay clean; existing
suites stay green.

## Out of scope (YAGNI — enabled by the pure builder/sender split)

Slack / Telegram / raw-JSON formats, multiple webhook URLs, message-template or
role-mention customization, a retry queue with backoff. All are small follow-ups given
the `buildDiscordPayload` / `sendWebhook` boundary.

## Risks

- **Producer early-return removal** must keep OS behavior byte-identical — the dispatcher
  re-applies the OS toggles, but the dependency arrays and data guards need care so
  events neither double-fire nor stop firing. Covered by reasoning + the routing tests;
  no render tests exist, so manual smoke of OS notifications after the change.
- **SSRF**: mitigated by https-only + private-host block; the payload carries only drop
  names/titles, no secrets, and the URL is user-supplied.
- **Discord rate limit** (30/min/webhook): event frequency is low and dedupe applies, so
  a single attempt is sufficient; `429` is surfaced rather than retried.

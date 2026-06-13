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
  // IPv6 link-local (fe80::/10) starts fe8/fe9/fea/feb
  if (host.includes(":") && /^fe[89ab]/.test(host)) return false;

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

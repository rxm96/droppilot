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

  it("rejects IPv6 loopback / unique-local / link-local", () => {
    expect(isAllowedWebhookUrl("https://[::1]/x")).toBe(false);
    expect(isAllowedWebhookUrl("https://[fc00::1]/x")).toBe(false);
    expect(isAllowedWebhookUrl("https://[fd12::1]/x")).toBe(false);
    expect(isAllowedWebhookUrl("https://[fe80::1]/x")).toBe(false);
  });

  it("accepts a public IPv4 literal over https", () => {
    expect(isAllowedWebhookUrl("https://203.0.113.10/x")).toBe(true);
  });
});

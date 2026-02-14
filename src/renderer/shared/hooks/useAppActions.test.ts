import { describe, expect, it, vi } from "vitest";
import { createStartLoginWithCreds } from "@renderer/shared/hooks/useAppActions";

describe("useAppActions helpers", () => {
  it("creates a handler that forwards current creds", () => {
    const startLoginWithCreds = vi.fn();
    const creds = { username: "u", password: "p", token: "t" };
    const handler = createStartLoginWithCreds(startLoginWithCreds, creds);
    handler();
    expect(startLoginWithCreds).toHaveBeenCalledWith(creds);
  });
});

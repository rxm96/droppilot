import { describe, expect, it } from "vitest";
import { dismissKey, resolveUpdateDialog } from "./updateDialogModel";

const base = { state: "downloaded", version: "4.2.0", dismissedVersion: null, installing: false };

describe("resolveUpdateDialog", () => {
  it("shows the ready dialog once an update is downloaded", () => {
    expect(resolveUpdateDialog(base)).toBe("ready");
  });

  it("stays hidden while the update is available or downloading", () => {
    for (const state of ["idle", "checking", "available", "downloading", "none", "unsupported"]) {
      expect(resolveUpdateDialog({ ...base, state })).toBe("hidden");
    }
  });

  it("hides after later for that version only", () => {
    expect(resolveUpdateDialog({ ...base, dismissedVersion: "4.2.0" })).toBe("hidden");
    expect(resolveUpdateDialog({ ...base, version: "4.3.0", dismissedVersion: "4.2.0" })).toBe(
      "ready",
    );
  });

  it("can dismiss an update without a version", () => {
    expect(
      resolveUpdateDialog({
        ...base,
        version: undefined,
        dismissedVersion: dismissKey(undefined),
      }),
    ).toBe("hidden");
  });

  it("shows installing after restart now, even if dismissed before", () => {
    expect(resolveUpdateDialog({ ...base, installing: true })).toBe("installing");
    expect(resolveUpdateDialog({ ...base, installing: true, dismissedVersion: "4.2.0" })).toBe(
      "installing",
    );
  });

  it("does not stay on installing when the install fails", () => {
    expect(resolveUpdateDialog({ ...base, state: "error", installing: true })).toBe("hidden");
  });
});

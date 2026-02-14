import { describe, expect, it } from "vitest";
import {
  errorInfoFromIpc,
  errorInfoFromUnknown,
  resolveErrorMessage,
} from "@renderer/shared/utils/errors";

describe("errors helpers", () => {
  it("normalizes ipc errors with fallback", () => {
    const info = errorInfoFromIpc(null, "fallback");
    expect(info).toEqual({ code: undefined, message: "fallback" });
  });

  it("prefers ipc error code/message when provided", () => {
    const info = errorInfoFromIpc(
      { error: "x", code: "some.code", message: "boom" },
      { message: "fallback" },
    );
    expect(info).toEqual({ code: "some.code", message: "boom" });
  });

  it("extracts code/message from unknown error objects", () => {
    const info = errorInfoFromUnknown({ code: "x", message: "y" }, "fallback");
    expect(info).toEqual({ code: "x", message: "y" });
  });

  it("falls back to Error.message for thrown errors", () => {
    const info = errorInfoFromUnknown(new Error("nope"), "fallback");
    expect(info).toEqual({ code: undefined, message: "nope" });
  });

  it("resolves localized error messages when available", () => {
    const t = (key: string) => (key === "error.some" ? "Translated" : key);
    const msg = resolveErrorMessage(t, { code: "some", message: "raw" });
    expect(msg).toBe("Translated");
  });

  it("falls back to message when translation is missing", () => {
    const t = (key: string) => key;
    const msg = resolveErrorMessage(t, { code: "missing", message: "raw" });
    expect(msg).toBe("raw");
  });
});

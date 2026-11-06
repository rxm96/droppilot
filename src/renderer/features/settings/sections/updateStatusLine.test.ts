import { describe, expect, it } from "vitest";
import { updateStatusLine } from "./updateStatusLine";

describe("updateStatusLine", () => {
  it("says not checked yet without a status", () => {
    expect(updateStatusLine(undefined)).toEqual({ key: "settings.status.idle", tone: "dim" });
    expect(updateStatusLine({ state: "idle" })).toEqual({
      key: "settings.status.idle",
      tone: "dim",
    });
  });

  it("up to date is ok", () => {
    expect(updateStatusLine({ state: "none" })).toEqual({
      key: "settings.status.upToDate",
      tone: "ok",
    });
  });

  it("available names the version", () => {
    expect(updateStatusLine({ state: "available", version: "4.1.0" })).toEqual({
      key: "settings.status.available",
      suffix: " · v4.1.0",
      tone: "accent",
    });
    expect(updateStatusLine({ state: "available" })).toEqual({
      key: "settings.status.available",
      tone: "accent",
    });
  });

  it("downloading shows the rounded percent", () => {
    expect(updateStatusLine({ state: "downloading", progress: 41.6 })).toEqual({
      key: "settings.status.downloading",
      suffix: " · 42%",
      tone: "accent",
    });
  });

  it("downloaded names the version", () => {
    expect(updateStatusLine({ state: "downloaded", version: "4.1.0" })).toMatchObject({
      key: "settings.status.downloaded",
      suffix: " · v4.1.0",
      tone: "ok",
    });
  });

  it("error is err, checking and unsupported are dim", () => {
    expect(updateStatusLine({ state: "error", message: "x" }).tone).toBe("err");
    expect(updateStatusLine({ state: "checking" })).toEqual({
      key: "settings.status.checking",
      tone: "dim",
    });
    expect(updateStatusLine({ state: "unsupported" })).toEqual({
      key: "settings.status.unsupported",
      tone: "dim",
    });
  });
});

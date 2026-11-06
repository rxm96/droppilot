import { describe, expect, it } from "vitest";
import { classifyJsonText } from "./jsonText";

describe("classifyJsonText", () => {
  it("accepts parseable JSON", () => {
    expect(classifyJsonText('{"a":1}')).toEqual({ status: "ok", raw: '{"a":1}' });
  });

  it("treats a blank file as corrupt", () => {
    expect(classifyJsonText("  \n")).toEqual({ status: "corrupt" });
  });

  it("treats NUL-filled content (power loss mid-write) as corrupt", () => {
    expect(classifyJsonText("\0\0\0\0")).toEqual({ status: "corrupt" });
  });

  it("treats truncated JSON as corrupt", () => {
    expect(classifyJsonText('{"priorityGames":["A",')).toEqual({ status: "corrupt" });
  });
});

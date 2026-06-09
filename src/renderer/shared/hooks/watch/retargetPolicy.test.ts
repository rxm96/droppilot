import { describe, expect, it } from "vitest";
import { rotateToNextPriorityTarget } from "./retargetPolicy";

const never = () => false;
const always = () => true;

describe("rotateToNextPriorityTarget", () => {
  it("rotates forward from the current game and wraps around", () => {
    expect(
      rotateToNextPriorityTarget({
        priorityOrder: ["A", "B", "C"],
        currentGame: "B",
        isGameBlocked: never,
        isGameActionable: always,
      }),
    ).toBe("C");
    expect(
      rotateToNextPriorityTarget({
        priorityOrder: ["A", "B", "C"],
        currentGame: "C",
        isGameBlocked: never,
        isGameActionable: always,
      }),
    ).toBe("A");
  });

  it("starts from the top when the current game is not in the list", () => {
    expect(
      rotateToNextPriorityTarget({
        priorityOrder: ["A", "B"],
        currentGame: "X",
        isGameBlocked: never,
        isGameActionable: always,
      }),
    ).toBe("A");
  });

  it("trims and deduplicates the priority order", () => {
    expect(
      rotateToNextPriorityTarget({
        priorityOrder: [" A ", "A", "", "B"],
        currentGame: "A",
        isGameBlocked: never,
        isGameActionable: always,
      }),
    ).toBe("B");
  });

  it("skips blocked games and never returns the current game", () => {
    expect(
      rotateToNextPriorityTarget({
        priorityOrder: ["A", "B", "C"],
        currentGame: "A",
        isGameBlocked: (g) => g === "B",
        isGameActionable: always,
      }),
    ).toBe("C");
    expect(
      rotateToNextPriorityTarget({
        priorityOrder: ["A"],
        currentGame: "A",
        isGameBlocked: never,
        isGameActionable: always,
      }),
    ).toBe("");
  });

  it("prefers the first actionable candidate, falls back to the first candidate", () => {
    expect(
      rotateToNextPriorityTarget({
        priorityOrder: ["A", "B", "C"],
        currentGame: "A",
        isGameBlocked: never,
        isGameActionable: (g) => g === "C",
      }),
    ).toBe("C");
    expect(
      rotateToNextPriorityTarget({
        priorityOrder: ["A", "B", "C"],
        currentGame: "A",
        isGameBlocked: never,
        isGameActionable: never,
      }),
    ).toBe("B");
  });

  it("returns empty for an empty order", () => {
    expect(
      rotateToNextPriorityTarget({
        priorityOrder: [],
        currentGame: "A",
        isGameBlocked: never,
        isGameActionable: always,
      }),
    ).toBe("");
  });
});

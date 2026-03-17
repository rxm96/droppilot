import { describe, expect, it } from "vitest";
import {
  canAddPriorityGame,
  getPriorityActionLabels,
  getPriorityEmptyPreviewRows,
  getPriorityQueueState,
  getPriorityStateChip,
  getSelectableDropGames,
} from "./PriorityView";

describe("getSelectableDropGames", () => {
  it("filters out games that are already in the priority list", () => {
    expect(getSelectableDropGames(["Rust", "WoW", "CS2"], ["WoW"])).toEqual(["Rust", "CS2"]);
  });

  it("filters out case-variant duplicates that are already prioritized", () => {
    expect(getSelectableDropGames(["Apex Legends", "Rust"], ["apex legends"])).toEqual(["Rust"]);
  });

  it("keeps active-drop games that are not in the priority list", () => {
    expect(getSelectableDropGames(["Rust", "WoW"], ["Apex"])).toEqual(["Rust", "WoW"]);
  });

  it("returns an empty list when every active-drop game is already prioritized", () => {
    expect(getSelectableDropGames(["Rust", "WoW"], ["Rust", "WoW"])).toEqual([]);
  });
});

describe("getPriorityActionLabels", () => {
  const t = (key: string, vars?: Record<string, string | number>) =>
    `${key}:${String(vars?.game ?? "")}`;

  it("includes the game name in the drag and remove labels", () => {
    expect(getPriorityActionLabels("Overwatch", t)).toEqual({
      dragLabel: "priorities.dragGame:Overwatch",
      removeLabel: "priorities.removeGame:Overwatch",
    });
  });

  it("preserves unusual game names for assistive labels", () => {
    expect(getPriorityActionLabels("مرحبا 🎮", t)).toEqual({
      dragLabel: "priorities.dragGame:مرحبا 🎮",
      removeLabel: "priorities.removeGame:مرحبا 🎮",
    });
  });
});

describe("canAddPriorityGame", () => {
  it("rejects empty and whitespace-only manual entries", () => {
    expect(canAddPriorityGame("")).toBe(false);
    expect(canAddPriorityGame("   ")).toBe(false);
  });

  it("accepts trimmed manual entries", () => {
    expect(canAddPriorityGame(" Rust ")).toBe(true);
  });

  it("rejects duplicate entries even when only the casing differs", () => {
    expect(canAddPriorityGame(" apex legends ", ["Apex Legends"])).toBe(false);
  });
});

describe("getPriorityQueueState", () => {
  it("treats any populated list as queue mode", () => {
    expect(getPriorityQueueState(2, true)).toBe("queue");
    expect(getPriorityQueueState(1, false)).toBe("queue");
  });

  it("uses the live-drop empty state when selectable games exist", () => {
    expect(getPriorityQueueState(0, true)).toBe("empty-live");
  });

  it("uses the manual-only empty state when no selectable games exist", () => {
    expect(getPriorityQueueState(0, false)).toBe("empty-manual");
  });
});

describe("getPriorityEmptyPreviewRows", () => {
  const t = (key: string) => key;

  it("builds a three-step preview for the live-drop empty state", () => {
    expect(getPriorityEmptyPreviewRows("empty-live", t)).toEqual([
      {
        title: "priorities.emptyPreviewLeadLiveTitle",
        meta: "priorities.emptyPreviewLeadLiveMeta",
        chip: "priorities.emptyPreviewLeadChip",
        isLeading: true,
      },
      {
        title: "priorities.emptyPreviewNextTitle",
        meta: "priorities.emptyPreviewNextMeta",
        chip: "priorities.emptyPreviewNextChip",
        isLeading: false,
      },
      {
        title: "priorities.emptyPreviewLaterTitle",
        meta: "priorities.emptyPreviewLaterMeta",
        chip: "priorities.emptyPreviewLaterChip",
        isLeading: false,
      },
    ]);
  });

  it("switches only the lead copy for the manual empty state", () => {
    expect(getPriorityEmptyPreviewRows("empty-manual", t)[0]).toEqual({
      title: "priorities.emptyPreviewLeadManualTitle",
      meta: "priorities.emptyPreviewLeadManualMeta",
      chip: "priorities.emptyPreviewLeadChip",
      isLeading: true,
    });
  });
});

describe("getPriorityStateChip", () => {
  const t = (key: string) => key;

  it("prefers watching over other row states", () => {
    expect(getPriorityStateChip({ isWatching: true, isTarget: true, isLive: true }, t)).toEqual({
      label: "priorities.badge.watching",
      tone: "watching",
    });
  });

  it("falls back from target to live and returns null when inactive", () => {
    expect(getPriorityStateChip({ isWatching: false, isTarget: true, isLive: true }, t)).toEqual({
      label: "priorities.badge.target",
      tone: "target",
    });
    expect(getPriorityStateChip({ isWatching: false, isTarget: false, isLive: true }, t)).toEqual({
      label: "priorities.state.live",
      tone: "live",
    });
    expect(getPriorityStateChip({ isWatching: false, isTarget: false, isLive: false }, t)).toBe(
      null,
    );
  });
});

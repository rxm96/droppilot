import { describe, expect, it } from "vitest";
import { recoverInstallableUpdateStatus, toInstallingUpdateStatus } from "./useUpdateActions";
import type { AppUpdateStatus } from "./useAppBootstrap";

describe("Update install state helpers", () => {
  const downloadedStatus: AppUpdateStatus = {
    state: "downloaded",
    version: "2.5.0",
    releaseNotes: "- Fixed updater handoff",
  };

  it("promotes a downloaded update into an installing state without losing metadata", () => {
    expect(toInstallingUpdateStatus(downloadedStatus)).toEqual({
      state: "installing",
      version: "2.5.0",
      releaseNotes: "- Fixed updater handoff",
    });
  });

  it("recovers a failed install back into the downloaded state so the user can retry", () => {
    expect(
      recoverInstallableUpdateStatus(
        {
          state: "installing",
          version: "2.5.0",
          releaseNotes: "- Fixed updater handoff",
        },
        "error.update.install_failed",
      ),
    ).toEqual({
      state: "downloaded",
      version: "2.5.0",
      releaseNotes: "- Fixed updater handoff",
      message: "error.update.install_failed",
    });
  });
});

import { join, win32 as pathWin32 } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildUpdateInstallerHelperScript,
  resolvePendingNsisInstall,
  resolveWscriptPath,
} from "./updateInstallerLauncher";

describe("resolveWscriptPath", () => {
  it("builds the Windows Script Host path from SystemRoot", () => {
    expect(resolveWscriptPath("C:\\Windows", () => true)).toBe(
      "C:\\Windows\\System32\\wscript.exe",
    );
  });
});

describe("resolvePendingNsisInstall", () => {
  it("extracts installer state from the updater instance", () => {
    const pending = resolvePendingNsisInstall(
      {
        installerPath: "C:\\Users\\xmari\\AppData\\Local\\Temp\\DropPilot Setup.exe",
        installDirectory: "C:\\Users\\xmari\\AppData\\Local\\Programs\\DropPilot",
        downloadedUpdateHelper: {
          packageFile: "C:\\Users\\xmari\\AppData\\Local\\Temp\\package.7z",
          downloadedFileInfo: { isAdminRightsRequired: false },
        },
      },
      "C:\\Users\\xmari\\AppData\\Local\\Programs\\DropPilot\\resources",
      () => false,
    );

    expect(pending).toEqual({
      installerPath: "C:\\Users\\xmari\\AppData\\Local\\Temp\\DropPilot Setup.exe",
      packageFile: "C:\\Users\\xmari\\AppData\\Local\\Temp\\package.7z",
      installDirectory: "C:\\Users\\xmari\\AppData\\Local\\Programs\\DropPilot",
      isAdminRightsRequired: false,
      elevatePath: null,
    });
  });
});

describe("buildUpdateInstallerHelperScript", () => {
  it("waits for the parent process and launches the visible installer", () => {
    const script = buildUpdateInstallerHelperScript({
      parentPid: 4242,
      installerPath: "C:\\Temp\\DropPilot Setup.exe",
      isAdminRightsRequired: false,
    });

    expect(script).toContain("while (processExists(config.parentPid)");
    expect(script).toContain("WScript.Sleep(config.pollMs);");
    expect(script).toContain("shell.Run(command, 1, false);");
    expect(script).toContain("--updated");
    expect(script).toContain("--force-run");
    expect(script).not.toContain("/S");
  });

  it("passes package and install directory arguments to NSIS", () => {
    const script = buildUpdateInstallerHelperScript({
      parentPid: 1,
      installerPath: "C:\\Temp\\DropPilot Setup.exe",
      packageFile: "C:\\Temp\\package file.7z",
      installDirectory: "C:\\Users\\xmari\\AppData\\Local\\Programs\\DropPilot",
      isAdminRightsRequired: false,
      helperLogPath: join("C:\\Temp", "droppilot-helper.log"),
    });

    expect(script).toContain("--package-file=");
    expect(script).toContain("/D=");
    expect(script).toContain("droppilot-helper.log");
  });

  it("uses elevate.exe when admin rights are required", () => {
    const script = buildUpdateInstallerHelperScript({
      parentPid: 1,
      installerPath: "C:\\Temp\\DropPilot Setup.exe",
      isAdminRightsRequired: true,
      elevatePath: pathWin32.join("C:\\Program Files\\DropPilot", "resources", "elevate.exe"),
    });

    expect(script).toContain("config.isAdminRightsRequired && config.elevatePath");
    expect(script).toContain("elevate.exe");
  });
});

import { describe, expect, it } from "vitest";
import {
  buildUpdateSplashPowerShellScript,
  escapePowerShellSingleQuoted,
  resolvePowerShellPath,
} from "./updateSplash";

describe("escapePowerShellSingleQuoted", () => {
  it("doubles single quotes for PowerShell single-quoted literals", () => {
    expect(escapePowerShellSingleQuoted("What's new")).toBe("What''s new");
  });
});

describe("resolvePowerShellPath", () => {
  it("builds the Windows PowerShell path from SystemRoot", () => {
    expect(resolvePowerShellPath("C:\\Windows")).toBe(
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    );
  });
});

describe("buildUpdateSplashPowerShellScript", () => {
  it("waits for the parent process to exit before showing the splash", () => {
    const script = buildUpdateSplashPowerShellScript({
      parentPid: 4242,
      executablePath: "C:\\Program Files\\DropPilot\\DropPilot.exe",
    });

    expect(script).toContain("$parentPid = 4242");
    expect(script).toContain("while ((Get-Process -Id $parentPid -ErrorAction SilentlyContinue)");
  });

  it("tracks the app process name without the .exe suffix", () => {
    const script = buildUpdateSplashPowerShellScript({
      parentPid: 1,
      executablePath: "C:\\Program Files\\DropPilot\\DropPilot.exe",
    });

    expect(script).toContain("$appProcessName = 'DropPilot'");
    expect(script).toContain("Get-Process -Name $appProcessName");
  });

  it("escapes title and message content safely", () => {
    const script = buildUpdateSplashPowerShellScript({
      parentPid: 1,
      executablePath: "C:\\DropPilot.exe",
      title: "Install's ready",
      message: "We're restarting",
    });

    expect(script).toContain("$title = 'Install''s ready'");
    expect(script).toContain("$message = 'We''re restarting'");
  });
});

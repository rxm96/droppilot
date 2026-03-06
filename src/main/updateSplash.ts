import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { win32 as pathWin32 } from "node:path";

const UPDATE_SPLASH_CLOSE_MS = 45_000;
const UPDATE_SPLASH_PARENT_WAIT_MS = 15_000;
const UPDATE_SPLASH_POLL_MS = 500;

type BuildUpdateSplashScriptParams = {
  parentPid: number;
  executablePath: string;
  title?: string;
  message?: string;
  closeAfterMs?: number;
};

type SpawnUpdateSplashParams = {
  parentPid: number;
  executablePath: string;
  title?: string;
  message?: string;
  closeAfterMs?: number;
};

export const escapePowerShellSingleQuoted = (value: string): string => value.replace(/'/g, "''");

export const resolvePowerShellPath = (systemRoot = process.env.SystemRoot): string => {
  if (!systemRoot) return "powershell.exe";
  const candidate = pathWin32.join(
    systemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  if (process.platform !== "win32") return candidate;
  return existsSync(candidate) ? candidate : "powershell.exe";
};

export const buildUpdateSplashPowerShellScript = ({
  parentPid,
  executablePath,
  title = "Installing update",
  message = "Restarting shortly...",
  closeAfterMs = UPDATE_SPLASH_CLOSE_MS,
}: BuildUpdateSplashScriptParams): string => {
  const sanitizedParentPid = Math.max(0, Math.floor(parentPid));
  const sanitizedCloseAfterMs = Math.max(1_000, Math.floor(closeAfterMs));
  const processName = pathWin32.parse(executablePath).name || "DropPilot";

  return [
    "$ErrorActionPreference = 'SilentlyContinue'",
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type -AssemblyName System.Drawing",
    `[System.Windows.Forms.Application]::EnableVisualStyles()`,
    `$parentPid = ${sanitizedParentPid}`,
    `$appProcessName = '${escapePowerShellSingleQuoted(processName)}'`,
    `$title = '${escapePowerShellSingleQuoted(title)}'`,
    `$message = '${escapePowerShellSingleQuoted(message)}'`,
    `$waitDeadline = [DateTime]::UtcNow.AddMilliseconds(${UPDATE_SPLASH_PARENT_WAIT_MS})`,
    `$closeAfterMs = ${sanitizedCloseAfterMs}`,
    "while ((Get-Process -Id $parentPid -ErrorAction SilentlyContinue) -and [DateTime]::UtcNow -lt $waitDeadline) { Start-Sleep -Milliseconds 150 }",
    "$form = New-Object System.Windows.Forms.Form",
    "$form.Text = $title",
    "$form.StartPosition = 'CenterScreen'",
    "$form.FormBorderStyle = 'None'",
    "$form.TopMost = $true",
    "$form.ShowInTaskbar = $false",
    "$form.BackColor = [System.Drawing.Color]::FromArgb(14, 18, 28)",
    "$form.ClientSize = New-Object System.Drawing.Size(360, 220)",
    "$titleLabel = New-Object System.Windows.Forms.Label",
    "$titleLabel.Text = $title",
    "$titleLabel.ForeColor = [System.Drawing.Color]::FromArgb(245, 247, 250)",
    "$titleLabel.Font = New-Object System.Drawing.Font('Segoe UI', 15.5, [System.Drawing.FontStyle]::Bold)",
    "$titleLabel.AutoSize = $true",
    "$titleLabel.Location = New-Object System.Drawing.Point(28, 28)",
    "$messageLabel = New-Object System.Windows.Forms.Label",
    "$messageLabel.Text = $message",
    "$messageLabel.ForeColor = [System.Drawing.Color]::FromArgb(181, 189, 206)",
    "$messageLabel.Font = New-Object System.Drawing.Font('Segoe UI', 10.5)",
    "$messageLabel.AutoSize = $true",
    "$messageLabel.Location = New-Object System.Drawing.Point(28, 70)",
    "$progress = New-Object System.Windows.Forms.ProgressBar",
    "$progress.Style = 'Marquee'",
    "$progress.MarqueeAnimationSpeed = 30",
    "$progress.Size = New-Object System.Drawing.Size(304, 12)",
    "$progress.Location = New-Object System.Drawing.Point(28, 154)",
    "$form.Controls.Add($titleLabel)",
    "$form.Controls.Add($messageLabel)",
    "$form.Controls.Add($progress)",
    "$closeTimer = New-Object System.Windows.Forms.Timer",
    "$closeTimer.Interval = $closeAfterMs",
    "$pollTimer = New-Object System.Windows.Forms.Timer",
    `$pollTimer.Interval = ${UPDATE_SPLASH_POLL_MS}`,
    "$closeTimer.Add_Tick({ $closeTimer.Stop(); $pollTimer.Stop(); $form.Close() })",
    "$pollTimer.Add_Tick({ $otherApp = @(Get-Process -Name $appProcessName -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $parentPid }); if ($otherApp.Count -gt 0) { $pollTimer.Stop(); $closeTimer.Stop(); $form.Close() } })",
    "$form.Add_Shown({ $closeTimer.Start(); $pollTimer.Start() })",
    "[void]$form.ShowDialog()",
  ].join("; ");
};

export const spawnDetachedUpdateSplash = ({
  parentPid,
  executablePath,
  title,
  message,
  closeAfterMs,
}: SpawnUpdateSplashParams): boolean => {
  try {
    const child = spawn(
      resolvePowerShellPath(),
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-WindowStyle",
        "Hidden",
        "-Command",
        buildUpdateSplashPowerShellScript({
          parentPid,
          executablePath,
          title,
          message,
          closeAfterMs,
        }),
      ],
      {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      },
    );
    child.unref();
    return true;
  } catch {
    return false;
  }
};

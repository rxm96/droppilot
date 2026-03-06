import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, win32 as pathWin32 } from "node:path";

const UPDATE_HELPER_PARENT_WAIT_MS = 15_000;
const UPDATE_HELPER_POLL_MS = 150;
const UPDATE_HELPER_SCRIPT_NAME = "droppilot-update-installer-helper.js";
const UPDATE_HELPER_LOG_NAME = "droppilot-update-installer.log";

type PendingNsisInstall = {
  installerPath: string;
  packageFile?: string | null;
  installDirectory?: string | null;
  isAdminRightsRequired: boolean;
  elevatePath?: string | null;
};

type UpdaterInstallState = {
  installerPath?: string | null;
  installDirectory?: string | null;
  downloadedUpdateHelper?: {
    packageFile?: string | null;
    downloadedFileInfo?: {
      isAdminRightsRequired?: boolean;
    } | null;
  } | null;
};

type SpawnUpdateInstallerHelperParams = PendingNsisInstall & {
  parentPid: number;
  helperScriptPath?: string;
  helperLogPath?: string;
};

const stringifyForJScript = (value: unknown): string => JSON.stringify(value);

export const resolveWscriptPath = (
  systemRoot = process.env.SystemRoot,
  pathExists: (path: string) => boolean = existsSync,
): string => {
  if (!systemRoot) return "wscript.exe";
  const candidate = pathWin32.join(systemRoot, "System32", "wscript.exe");
  if (process.platform !== "win32") return candidate;
  return pathExists(candidate) ? candidate : "wscript.exe";
};

export const resolvePendingNsisInstall = (
  updater: unknown,
  resourcesPath = process.resourcesPath,
  pathExists: (path: string) => boolean = existsSync,
): PendingNsisInstall | null => {
  if (!updater || typeof updater !== "object") return null;
  const state = updater as UpdaterInstallState;
  const installerPath =
    typeof state.installerPath === "string" && state.installerPath.trim().length > 0
      ? state.installerPath
      : null;
  if (!installerPath) return null;
  const packageFile =
    typeof state.downloadedUpdateHelper?.packageFile === "string" &&
    state.downloadedUpdateHelper.packageFile.trim().length > 0
      ? state.downloadedUpdateHelper.packageFile
      : null;
  const installDirectory =
    typeof state.installDirectory === "string" && state.installDirectory.trim().length > 0
      ? state.installDirectory
      : null;
  const elevateCandidate = pathWin32.join(resourcesPath, "elevate.exe");
  return {
    installerPath,
    packageFile,
    installDirectory,
    isAdminRightsRequired:
      state.downloadedUpdateHelper?.downloadedFileInfo?.isAdminRightsRequired === true,
    elevatePath: pathExists(elevateCandidate) ? elevateCandidate : null,
  };
};

export const buildUpdateInstallerHelperScript = ({
  parentPid,
  installerPath,
  packageFile,
  installDirectory,
  isAdminRightsRequired,
  elevatePath,
  helperLogPath = join(tmpdir(), UPDATE_HELPER_LOG_NAME),
}: SpawnUpdateInstallerHelperParams): string => {
  const config = {
    parentPid: Math.max(0, Math.floor(parentPid)),
    installerPath,
    packageFile: packageFile ?? null,
    installDirectory: installDirectory ?? null,
    isAdminRightsRequired,
    elevatePath: elevatePath ?? null,
    helperLogPath,
    parentWaitMs: UPDATE_HELPER_PARENT_WAIT_MS,
    pollMs: UPDATE_HELPER_POLL_MS,
  };

  return [
    `var config = ${stringifyForJScript(config)};`,
    "var shell = new ActiveXObject('WScript.Shell');",
    "var fso = new ActiveXObject('Scripting.FileSystemObject');",
    "function log(message) {",
    "  try {",
    "    if (!config.helperLogPath) return;",
    "    var file = fso.OpenTextFile(config.helperLogPath, 8, true, -1);",
    "    file.WriteLine((new Date()).toISOString() + ' ' + message);",
    "    file.Close();",
    "  } catch (e) {}",
    "}",
    "function quoteArg(value) {",
    "  if (value === null || value === undefined || value === '') return '\"\"';",
    "  if (/\\s|\"/.test(value)) return '\"' + String(value).replace(/\"/g, '\\\\\"') + '\"';",
    "  return String(value);",
    "}",
    "function processExists(pid) {",
    "  if (!pid) return false;",
    "  try {",
    "    var service = GetObject('winmgmts:root\\\\cimv2');",
    "    var result = service.ExecQuery('Select * From Win32_Process Where ProcessId=' + pid);",
    "    return !new Enumerator(result).atEnd();",
    "  } catch (e) {",
    "    log('process query failed: ' + e.message);",
    "    return false;",
    "  }",
    "}",
    "function buildCommand() {",
    "  var args = ['--updated', '--force-run'];",
    "  if (config.packageFile) args.push('--package-file=' + config.packageFile);",
    "  if (config.installDirectory) args.push('/D=' + config.installDirectory);",
    "  var command = config.isAdminRightsRequired && config.elevatePath",
    "    ? [quoteArg(config.elevatePath), quoteArg(config.installerPath)]",
    "    : [quoteArg(config.installerPath)];",
    "  for (var i = 0; i < args.length; i += 1) command.push(quoteArg(args[i]));",
    "  return command.join(' ');",
    "}",
    "log('helper started for parentPid=' + config.parentPid);",
    "var waitDeadline = new Date().getTime() + config.parentWaitMs;",
    "while (processExists(config.parentPid) && new Date().getTime() < waitDeadline) {",
    "  WScript.Sleep(config.pollMs);",
    "}",
    "var command = buildCommand();",
    "log('launching installer: ' + command);",
    "shell.Run(command, 1, false);",
    "log('installer launched');",
  ].join("\r\n");
};

export const spawnDetachedUpdateInstallerHelper = ({
  parentPid,
  helperScriptPath = join(tmpdir(), UPDATE_HELPER_SCRIPT_NAME),
  ...pendingInstall
}: SpawnUpdateInstallerHelperParams): boolean => {
  try {
    writeFileSync(
      helperScriptPath,
      buildUpdateInstallerHelperScript({
        parentPid,
        ...pendingInstall,
      }),
      "utf-8",
    );
    const child = spawn(resolveWscriptPath(), ["//Nologo", "//B", helperScriptPath], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
};

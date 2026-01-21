import { app } from "electron";

export function applyAutoStartSetting(enabled: boolean) {
  if (process.platform !== "win32") return;
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: app.getPath("exe"),
  });
}

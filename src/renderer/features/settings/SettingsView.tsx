import { useI18n } from "@renderer/shared/i18n";
import type { ThemePreference } from "@renderer/shared/theme";

type SettingsProps = {
  isLinked: boolean;
  language: "de" | "en";
  setLanguage: (val: "de" | "en") => void;
  theme: ThemePreference;
  setTheme: (val: ThemePreference) => void;
  autoStart: boolean;
  setAutoStart: (val: boolean) => void;
  autoClaim: boolean;
  setAutoClaim: (val: boolean) => void;
  autoSelect: boolean;
  setAutoSelect: (val: boolean) => void;
  autoSwitchEnabled: boolean;
  setAutoSwitchEnabled: (val: boolean) => void;
  warmupEnabled: boolean;
  setWarmupEnabled: (val: boolean) => void;
  betaUpdates: boolean;
  setBetaUpdates: (val: boolean) => void;
  demoMode: boolean;
  setDemoMode: (val: boolean) => void;
  debugEnabled: boolean;
  setDebugEnabled: (val: boolean) => void;
  alertsEnabled: boolean;
  setAlertsEnabled: (val: boolean) => void;
  alertsNotifyWhileFocused: boolean;
  setAlertsNotifyWhileFocused: (val: boolean) => void;
  alertsDropClaimed: boolean;
  setAlertsDropClaimed: (val: boolean) => void;
  alertsDropEndingSoon: boolean;
  setAlertsDropEndingSoon: (val: boolean) => void;
  alertsDropEndingMinutes: number;
  setAlertsDropEndingMinutes: (val: number) => void;
  alertsWatchError: boolean;
  setAlertsWatchError: (val: boolean) => void;
  alertsAutoSwitch: boolean;
  setAlertsAutoSwitch: (val: boolean) => void;
  alertsNewDrops: boolean;
  setAlertsNewDrops: (val: boolean) => void;
  sendTestAlert: () => void;
  refreshMinMs: number;
  refreshMaxMs: number;
  setRefreshIntervals: (minMs: number, maxMs: number) => void;
  resetAutomation: () => void;
  settingsJson: string;
  setSettingsJson: (val: string) => void;
  exportSettings: () => void;
  importSettings: () => void;
  settingsInfo?: string | null;
  settingsError?: string | null;
  showUpdateCheck?: boolean;
  showAutoStart?: boolean;
  checkUpdates?: () => void;
  downloadUpdate?: () => void;
  installUpdate?: () => void;
  updateStatus?: {
    state:
      | "idle"
      | "checking"
      | "available"
      | "downloading"
      | "downloaded"
      | "none"
      | "error"
      | "unsupported";
    message?: string;
    version?: string;
    progress?: number;
    transferred?: number;
    total?: number;
    bytesPerSecond?: number;
  };
};

export function SettingsView({
  isLinked,
  language,
  setLanguage,
  theme,
  setTheme,
  autoStart,
  setAutoStart,
  autoClaim,
  setAutoClaim,
  autoSelect,
  setAutoSelect,
  autoSwitchEnabled,
  setAutoSwitchEnabled,
  warmupEnabled,
  setWarmupEnabled,
  betaUpdates,
  setBetaUpdates,
  demoMode,
  setDemoMode,
  debugEnabled,
  setDebugEnabled,
  alertsEnabled,
  setAlertsEnabled,
  alertsNotifyWhileFocused,
  setAlertsNotifyWhileFocused,
  alertsDropClaimed,
  setAlertsDropClaimed,
  alertsDropEndingSoon,
  setAlertsDropEndingSoon,
  alertsDropEndingMinutes,
  setAlertsDropEndingMinutes,
  alertsWatchError,
  setAlertsWatchError,
  alertsAutoSwitch,
  setAlertsAutoSwitch,
  alertsNewDrops,
  setAlertsNewDrops,
  sendTestAlert,
  refreshMinMs,
  refreshMaxMs,
  setRefreshIntervals,
  resetAutomation,
  settingsJson,
  setSettingsJson,
  exportSettings,
  importSettings,
  settingsInfo,
  settingsError,
  showUpdateCheck,
  showAutoStart,
  checkUpdates,
  downloadUpdate,
  installUpdate,
  updateStatus,
}: SettingsProps) {
  const { t } = useI18n();
  const resolveUiText = (text?: string | null) => {
    if (!text) return null;
    const translated = t(text);
    return translated !== text ? translated : text;
  };
  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return "0 MB";
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };
  const progressPct = Math.min(100, Math.max(0, Math.round(updateStatus?.progress ?? 0)));
  const showProgress = updateStatus?.state === "downloading" && Number.isFinite(progressPct);
  const canDownload = updateStatus?.state === "available" && typeof downloadUpdate === "function";
  const canInstall = updateStatus?.state === "downloaded" && typeof installUpdate === "function";
  const updateLabel = (() => {
    if (!updateStatus || updateStatus.state === "idle") return null;
    switch (updateStatus.state) {
      case "checking":
        return t("settings.updateChecking");
      case "available":
        return t("settings.updateAvailable", { version: updateStatus.version ?? "?" });
      case "downloading":
        return t("settings.updateDownloading", {
          percent: progressPct,
          transferred: formatBytes(updateStatus.transferred),
          total: formatBytes(updateStatus.total),
        });
      case "downloaded":
        return t("settings.updateDownloaded");
      case "none":
        return t("settings.updateNone");
      case "unsupported":
        return t("settings.updateUnsupported");
      case "error":
        return updateStatus.message
          ? `${t("settings.updateError")}: ${resolveUiText(updateStatus.message)}`
          : t("settings.updateError");
      default:
        return null;
    }
  })();
  const settingsInfoText = resolveUiText(settingsInfo);
  const settingsErrorText = resolveUiText(settingsError);
  return (
    <>
      <div className="settings-head">
        <div>
          <h2>{t("settings.title")}</h2>
          <p className="meta">{t("settings.quickActions")}</p>
        </div>
        {demoMode ? <span className="settings-chip">{t("settings.demoMode")}</span> : null}
      </div>
      <div className="settings-sections">
        <div className="settings-column">
          <section className="settings-section">
            <div className="settings-row">
              <div>
                <div className="label">{t("settings.session")}</div>
                <p className="meta">{isLinked ? t("session.ready") : t("session.loginNeeded")}</p>
              </div>
              <div className="settings-actions">
                <span className={`status-pill ${isLinked ? "ok" : "warn"}`}>
                  {isLinked ? t("session.connected") : t("session.disconnected")}
                </span>
              </div>
            </div>
            <div className="settings-row">
              <div className="label">{t("settings.languageLabel")}</div>
              <select
                className="select"
                value={language}
                onChange={(e) => setLanguage((e.target.value as "de" | "en") || "de")}
              >
                <option value="de">{t("settings.language.de")}</option>
                <option value="en">{t("settings.language.en")}</option>
              </select>
            </div>
            <div className="settings-row">
              <div className="label">{t("theme.toggle")}</div>
              <select
                className="select"
                value={theme}
                onChange={(e) => setTheme((e.target.value as ThemePreference) || "light")}
              >
                <option value="light">{t("theme.light")}</option>
                <option value="dark">{t("theme.dark")}</option>
              </select>
            </div>
            {showAutoStart ? (
              <div className="toggle-row">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={autoStart}
                    onChange={(e) => setAutoStart(e.target.checked)}
                  />
                  <span>{t("settings.autoStart")}</span>
                </label>
              </div>
            ) : null}
            {showUpdateCheck ? (
              <div className="settings-row">
                <div>
                  <div className="label">{t("settings.updates")}</div>
                  {updateLabel ? <p className="meta">{updateLabel}</p> : null}
                  {showProgress ? (
                    <div className="progress-bar small" style={{ marginTop: 8 }}>
                      <span style={{ width: `${progressPct}%` }} />
                    </div>
                  ) : null}
                </div>
                <div className="settings-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={checkUpdates}
                    disabled={!checkUpdates || updateStatus?.state === "checking"}
                  >
                    {t("settings.checkUpdates")}
                  </button>
                  {canDownload ? (
                    <button type="button" onClick={downloadUpdate}>
                      {t("settings.updateDownload")}
                    </button>
                  ) : null}
                  {canInstall ? (
                    <button type="button" onClick={installUpdate}>
                      {t("settings.updateInstall")}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
            {showUpdateCheck ? (
              <div className="toggle-row">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={betaUpdates}
                    onChange={(e) => setBetaUpdates(e.target.checked)}
                  />
                  <span className="toggle-label">
                    <span className="toggle-title">{t("settings.updateBeta")}</span>
                    <span className="toggle-hint">{t("settings.updateBetaHint")}</span>
                  </span>
                </label>
              </div>
            ) : null}
          </section>

          <section className="settings-section">
            <div className="settings-row">
              <div>
                <div className="label">{t("settings.demoModeTitle")}</div>
                <p className="meta">{t("settings.demoModeHint")}</p>
              </div>
            </div>
            <div className="toggle-row">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={demoMode}
                  onChange={(e) => setDemoMode(e.target.checked)}
                />
                <span>{t("settings.demoMode")}</span>
              </label>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-row">
              <div>
                <div className="label">{t("settings.debugTitle")}</div>
                <p className="meta">{t("settings.debugHint")}</p>
              </div>
            </div>
            <div className="toggle-row">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={debugEnabled}
                  onChange={(e) => setDebugEnabled(e.target.checked)}
                />
                <span>{t("settings.debugToggle")}</span>
              </label>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-row">
              <div>
                <div className="label">{t("settings.advanced")}</div>
                <p className="meta">{t("settings.advancedHint")}</p>
              </div>
              <div className="settings-actions">
                <button type="button" className="ghost subtle-btn" onClick={resetAutomation}>
                  {t("settings.resetAutomation")}
                </button>
              </div>
            </div>
            <div className="toggle-row">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={autoClaim}
                  onChange={(e) => setAutoClaim(e.target.checked)}
                />
                <span className="toggle-label">
                  <span className="toggle-title">{t("settings.autoClaim")}</span>
                  <span className="toggle-hint">{t("settings.autoClaimHint")}</span>
                </span>
              </label>
            </div>
            <div className="toggle-row">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={autoSelect}
                  onChange={(e) => setAutoSelect(e.target.checked)}
                />
                <span className="toggle-label">
                  <span className="toggle-title">{t("settings.autoSelect")}</span>
                  <span className="toggle-hint">{t("settings.autoSelectHint")}</span>
                </span>
              </label>
            </div>
            <div className="toggle-row">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={autoSwitchEnabled}
                  onChange={(e) => setAutoSwitchEnabled(e.target.checked)}
                />
                <span className="toggle-label">
                  <span className="toggle-title">{t("settings.autoSwitch")}</span>
                  <span className="toggle-hint">{t("settings.autoSwitchHint")}</span>
                </span>
              </label>
            </div>
            <div className="toggle-row">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={warmupEnabled}
                  onChange={(e) => setWarmupEnabled(e.target.checked)}
                />
                <span className="toggle-label">
                  <span className="toggle-title">{t("settings.warmup")}</span>
                  <span className="toggle-hint">{t("settings.warmupHint")}</span>
                </span>
              </label>
            </div>
            <div className="settings-row">
              <div>
                <div className="label">{t("settings.refreshInterval")}</div>
                <p className="meta">{t("settings.refreshHint")}</p>
              </div>
              <div className="settings-actions">
                <label className="meta">
                  Min (s)
                  <input
                    type="number"
                    className="input"
                    min={60}
                    step={10}
                    value={Math.round(refreshMinMs / 1000)}
                    onChange={(e) => {
                      const val = Number(e.target.value) * 1000;
                      setRefreshIntervals(val, refreshMaxMs);
                    }}
                    onBlur={() => setRefreshIntervals(refreshMinMs, refreshMaxMs)}
                  />
                </label>
                <label className="meta">
                  Max (s)
                  <input
                    type="number"
                    className="input"
                    min={60}
                    step={10}
                    value={Math.round(refreshMaxMs / 1000)}
                    onChange={(e) => {
                      const val = Number(e.target.value) * 1000;
                      setRefreshIntervals(refreshMinMs, val);
                    }}
                    onBlur={() => setRefreshIntervals(refreshMinMs, refreshMaxMs)}
                  />
                </label>
              </div>
            </div>
          </section>
        </div>

        <div className="settings-column">
          <section className="settings-section">
            <div className="settings-row">
              <div>
                <div className="label">{t("settings.alerts")}</div>
                <p className="meta">{t("settings.alertsHint")}</p>
              </div>
            </div>
            <div className="toggle-row">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={alertsEnabled}
                  onChange={(e) => setAlertsEnabled(e.target.checked)}
                />
                <span>{t("settings.alerts.enabled")}</span>
              </label>
            </div>
            <div className="toggle-row">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={alertsNotifyWhileFocused}
                  disabled={!alertsEnabled}
                  onChange={(e) => setAlertsNotifyWhileFocused(e.target.checked)}
                />
                <span>{t("settings.alerts.foreground")}</span>
              </label>
            </div>
            <div className="toggle-row">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={alertsDropClaimed}
                  disabled={!alertsEnabled}
                  onChange={(e) => setAlertsDropClaimed(e.target.checked)}
                />
                <span>{t("settings.alerts.dropClaimed")}</span>
              </label>
            </div>
            <div className="toggle-row">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={alertsDropEndingSoon}
                  disabled={!alertsEnabled}
                  onChange={(e) => setAlertsDropEndingSoon(e.target.checked)}
                />
                <span>{t("settings.alerts.dropEnding")}</span>
              </label>
            </div>
            <div className="settings-row">
              <label className="meta">
                {t("settings.alerts.dropEndingMinutes")}
                <input
                  type="number"
                  className="input"
                  min={1}
                  max={60}
                  step={1}
                  value={alertsDropEndingMinutes}
                  disabled={!alertsEnabled || !alertsDropEndingSoon}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setAlertsDropEndingMinutes(val);
                  }}
                  onBlur={() => setAlertsDropEndingMinutes(alertsDropEndingMinutes)}
                />
              </label>
            </div>
            <div className="toggle-row">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={alertsWatchError}
                  disabled={!alertsEnabled}
                  onChange={(e) => setAlertsWatchError(e.target.checked)}
                />
                <span>{t("settings.alerts.watchError")}</span>
              </label>
            </div>
            <div className="toggle-row">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={alertsAutoSwitch}
                  disabled={!alertsEnabled}
                  onChange={(e) => setAlertsAutoSwitch(e.target.checked)}
                />
                <span>{t("settings.alerts.autoSwitch")}</span>
              </label>
            </div>
            <div className="toggle-row">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={alertsNewDrops}
                  disabled={!alertsEnabled}
                  onChange={(e) => setAlertsNewDrops(e.target.checked)}
                />
                <span>{t("settings.alerts.newDrops")}</span>
              </label>
            </div>
            <div className="settings-row">
              <div className="settings-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={sendTestAlert}
                  disabled={!alertsEnabled}
                >
                  {t("settings.alerts.test")}
                </button>
              </div>
            </div>
          </section>

          <section className="settings-section">
            <div className="label">{t("settings.backupTitle")}</div>
            <p className="meta">{t("settings.backupHint")}</p>
            <textarea
              className="settings-textarea"
              value={settingsJson}
              onChange={(e) => setSettingsJson(e.target.value)}
              rows={8}
            />
            <div className="cta-row">
              <button type="button" onClick={exportSettings}>
                {t("settings.export")}
              </button>
              <button type="button" className="ghost" onClick={importSettings}>
                {t("settings.import")}
              </button>
            </div>
            {settingsInfoText ? <p className="meta">{settingsInfoText}</p> : null}
            {settingsErrorText ? <p className="error">{settingsErrorText}</p> : null}
          </section>
        </div>
      </div>
    </>
  );
}

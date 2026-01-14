import { useI18n } from "../i18n";

type SettingsProps = {
  startLogin: () => void;
  logout: () => void;
  isLinked: boolean;
  uniqueGames: string[];
  selectedGame: string;
  setSelectedGame: (val: string) => void;
  newGame: string;
  setNewGame: (val: string) => void;
  addGame: () => void;
  addGameFromSelect: () => void;
  priorityGames: string[];
  previewPriorityGames: string[];
  removeGame: (name: string) => void;
  dragIndex: number | null;
  dragOverIndex: number | null;
  setDragIndex: (idx: number | null) => void;
  setDragOverIndex: (idx: number | null) => void;
  handleDropReorder: (idx: number) => void;
  obeyPriority: boolean;
  setObeyPriority: (val: boolean) => void;
  language: "de" | "en";
  setLanguage: (val: "de" | "en") => void;
  autoClaim: boolean;
  setAutoClaim: (val: boolean) => void;
  autoSelect: boolean;
  setAutoSelect: (val: boolean) => void;
  autoSwitchEnabled: boolean;
  setAutoSwitchEnabled: (val: boolean) => void;
  demoMode: boolean;
  setDemoMode: (val: boolean) => void;
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
  checkUpdates?: () => void;
  updateStatus?: {
    state: "idle" | "checking" | "available" | "none" | "error" | "unsupported";
    message?: string;
    version?: string;
  };
};

export function SettingsView({
  startLogin,
  logout,
  isLinked,
  uniqueGames,
  selectedGame,
  setSelectedGame,
  newGame,
  setNewGame,
  addGame,
  addGameFromSelect,
  priorityGames,
  previewPriorityGames,
  removeGame,
  dragIndex,
  dragOverIndex,
  setDragIndex,
  setDragOverIndex,
  handleDropReorder,
  obeyPriority,
  setObeyPriority,
  language,
  setLanguage,
  autoClaim,
  setAutoClaim,
  autoSelect,
  setAutoSelect,
  autoSwitchEnabled,
  setAutoSwitchEnabled,
  demoMode,
  setDemoMode,
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
  checkUpdates,
  updateStatus,
}: SettingsProps) {
  const { t } = useI18n();
  const updateLabel = (() => {
    if (!updateStatus || updateStatus.state === "idle") return null;
    switch (updateStatus.state) {
      case "checking":
        return t("settings.updateChecking");
      case "available":
        return t("settings.updateAvailable", { version: updateStatus.version ?? "?" });
      case "none":
        return t("settings.updateNone");
      case "unsupported":
        return t("settings.updateUnsupported");
      case "error":
        return updateStatus.message
          ? `${t("settings.updateError")}: ${updateStatus.message}`
          : t("settings.updateError");
      default:
        return null;
    }
  })();
  return (
    <>
      <div className="settings-sections">
        <section className="settings-section">
          <div className="settings-row">
            <div>
              <div className="label">{t("settings.session")}</div>
              <p className="meta">{t("settings.quickActions")}</p>
            </div>
            <div className="settings-actions">
              {!isLinked && (
                <button type="button" onClick={startLogin}>
                  {t("session.loginBrowser")}
                </button>
              )}
              {isLinked && (
                <button type="button" className="ghost" onClick={logout}>
                  {t("session.logout")}
                </button>
              )}
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
          {showUpdateCheck ? (
            <div className="settings-row">
              <div>
                <div className="label">{t("settings.updates")}</div>
                {updateLabel ? <p className="meta">{updateLabel}</p> : null}
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
              </div>
            </div>
          ) : null}
        </section>

        <section className="settings-section">
          <div className="settings-row">
            <div>
              <div className="label">{t("settings.priorityGames")}</div>
              <p className="meta">{t("settings.backupHint")}</p>
            </div>
          </div>
          {uniqueGames.length > 0 && (
            <div className="settings-row">
              <select
                className="select"
                value={selectedGame || ""}
                onChange={(e) => setSelectedGame(e.target.value)}
              >
                <option value="">{t("settings.addFromDropsOption")}</option>
                {uniqueGames.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <button type="button" onClick={addGameFromSelect} disabled={!selectedGame}>
                {t("settings.add")}
              </button>
            </div>
          )}
          <div className="settings-row">
            <input
              type="text"
              className="input"
              placeholder={t("settings.addGamePlaceholder")}
              value={newGame}
              onChange={(e) => setNewGame(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addGame();
                }
              }}
              aria-label={t("settings.addGamePlaceholder")}
            />
            <button type="button" onClick={addGame}>
              {t("settings.add")}
            </button>
          </div>
          {priorityGames.length === 0 && <p className="meta">{t("settings.noneEntries")}</p>}
          {previewPriorityGames.length > 0 && (
            <ul className="priority-list">
              {previewPriorityGames.map((g, idx) => (
                <li
                  key={g}
                  draggable
                  onDragStart={() => setDragIndex(idx)}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverIndex(idx);
                  }}
                  onDrop={() => handleDropReorder(idx)}
                  className={`${dragIndex === idx ? "dragging" : ""} ${dragOverIndex === idx ? "drop-target" : ""}`}
                >
                  <span>{g}</span>
                  <div className="priority-actions">
                    <span className="pill ghost">{t("settings.drag")}</span>
                    <button type="button" className="ghost" onClick={() => removeGame(g)}>
                      {t("settings.remove")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="toggle-row">
            <label className="toggle">
              <input
                type="checkbox"
                checked={obeyPriority}
                onChange={(e) => {
                  setObeyPriority(e.target.checked);
                }}
              />
              <span>{t("settings.obey")}</span>
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
              <span>{t("settings.autoClaim")}</span>
            </label>
          </div>
          <div className="toggle-row">
            <label className="toggle">
              <input
                type="checkbox"
                checked={autoSelect}
                onChange={(e) => setAutoSelect(e.target.checked)}
              />
              <span>{t("settings.autoSelect")}</span>
            </label>
          </div>
          <div className="toggle-row">
            <label className="toggle">
              <input
                type="checkbox"
                checked={autoSwitchEnabled}
                onChange={(e) => setAutoSwitchEnabled(e.target.checked)}
              />
              <span>{t("settings.autoSwitch")}</span>
            </label>
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
          <p className="meta">{t("settings.demoModeHint")}</p>
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
          {settingsInfo ? <p className="meta">{settingsInfo}</p> : null}
          {settingsError ? <p className="error">{settingsError}</p> : null}
        </section>
      </div>
    </>
  );
}

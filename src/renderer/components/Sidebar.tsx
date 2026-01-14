import type { AuthState, View } from "../types";
import { useI18n } from "../i18n";

type SidebarProps = {
  view: View;
  setView: (v: View) => void;
  auth: AuthState;
  creds: { username: string; password: string; token: string };
  setCreds: (next: { username: string; password: string; token: string }) => void;
  startLoginWithCreds: () => void;
  startLogin: () => void;
  logout: () => void;
};

export function Sidebar({
  view,
  setView,
  auth,
  creds,
  setCreds,
  startLoginWithCreds,
  startLogin,
  logout,
}: SidebarProps) {
  const { t } = useI18n();
  const isLinked = auth.status === "ok";
  const navItems: Array<{ key: View; label: string; caption: string }> = [
    { key: "overview", label: t("nav.overview"), caption: t("nav.overview.caption") },
    { key: "inventory", label: t("nav.inventory"), caption: t("nav.inventory.caption") },
    { key: "control", label: t("nav.control"), caption: t("nav.control.caption") },
    { key: "debug", label: t("nav.debug"), caption: t("nav.debug.caption") },
    { key: "settings", label: t("nav.settings"), caption: t("nav.settings.caption") },
  ];

  const icons: Record<View, JSX.Element> = {
    overview: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zm0 2.236L6 7.8v6.4l6 3.264 6-3.264V7.8l-6-2.564z"
          fill="currentColor"
        />
      </svg>
    ),
    inventory: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M5 5h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 2v10h12V7H6zm2 2h8v2H8V9zm0 4h5v2H8v-2z"
          fill="currentColor"
        />
      </svg>
    ),
    control: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M6 4h2v16H6V4zm10 0h2v16h-2V4zM3 9h2v6H3V9zm16 0h2v6h-2V9zM9 7h2v10H9V7zm4 0h2v10h-2V7z"
          fill="currentColor"
        />
      </svg>
    ),
    settings: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0-6l1.8 3.2a7.96 7.96 0 0 1 2.8 1.16L20 4l1 1.73-2.42 1.4c.13.53.2 1.08.2 1.64 0 .56-.07 1.11-.2 1.64L21 11.27 20 13l-3.4-1.96a7.96 7.96 0 0 1-2.8 1.16L12 16l-1.8-3.2a7.96 7.96 0 0 1-2.8-1.16L4 13l-1-1.73 2.42-1.4A8.05 8.05 0 0 1 5.2 8c0-.56.07-1.11.2-1.64L3 4.73 4 3l3.4 1.96a7.96 7.96 0 0 1 2.8-1.16L12 2z"
          fill="currentColor"
        />
      </svg>
    ),
    debug: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M7 3h10a2 2 0 0 1 2 2v4h2v2h-2v2h2v2h-2v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-4H3v-2h2v-2H3V9h2V5a2 2 0 0 1 2-2zm0 2v14h10V5H7zm2 3h6v2H9V8zm0 4h6v2H9v-2z"
          fill="currentColor"
        />
      </svg>
    ),
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-card sidebar-status">
        <div className="sidebar-status-row">
          <div>
            <p className="eyebrow">{t("session.title")}</p>
            <h4 className="sidebar-title">
              {isLinked ? t("session.connected") : t("session.disconnected")}
            </h4>
            <p className="meta">
              {auth.status === "pending"
                ? t("session.loggingIn")
                : isLinked
                  ? t("session.ready")
                  : t("session.loginNeeded")}
            </p>
          </div>
          <span className={`chip ${isLinked ? "chip-ok" : "chip-warn"}`}>
            {isLinked ? t("session.linkedChip") : t("session.offlineChip")}
          </span>
        </div>
        <div className="sidebar-actions">
          {isLinked ? (
            <button type="button" className="ghost subtle-btn" onClick={logout}>
              {t("session.logout")}
            </button>
          ) : (
            <button type="button" onClick={startLogin} disabled={auth.status === "pending"}>
              {auth.status === "pending" ? t("session.login") : t("session.loginBrowser")}
            </button>
          )}
        </div>
      </div>

      <div className="sidebar-card nav-card">
        <div className="nav-head">
          <p className="meta">{t("nav.title")}</p>
        </div>
        <ul className="nav">
          {navItems.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                className={view === item.key ? "nav-btn active" : "nav-btn"}
                onClick={() => setView(item.key)}
              >
                <span className="nav-icon" aria-hidden="true">
                  {icons[item.key]}
                </span>
                <span className="nav-text">
                  <span className="nav-label">{item.label}</span>
                  <span className="nav-caption">{item.caption}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {auth.status !== "ok" && (
        <div className="sidebar-card auth-card">
          <div className="label">{t("session.credentials")}</div>
          <div className="auth-form">
            <input
              type="text"
              placeholder={t("session.username")}
              value={creds.username}
              onChange={(e) => setCreds({ ...creds, username: e.target.value })}
            />
            <input
              type="password"
              placeholder={t("session.password")}
              value={creds.password}
              onChange={(e) => setCreds({ ...creds, password: e.target.value })}
            />
            <input
              type="text"
              placeholder={t("session.token")}
              value={creds.token}
              onChange={(e) => setCreds({ ...creds, token: e.target.value })}
            />
            <button
              type="button"
              onClick={startLoginWithCreds}
              disabled={auth.status === "pending"}
            >
              {auth.status === "pending" ? t("session.login") : t("session.loginCredentials")}
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

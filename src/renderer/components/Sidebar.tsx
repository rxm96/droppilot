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
    { key: "priorities", label: t("nav.priorities"), caption: t("nav.priorities.caption") },
    { key: "debug", label: t("nav.debug"), caption: t("nav.debug.caption") },
    { key: "settings", label: t("nav.settings"), caption: t("nav.settings.caption") },
  ];

  const icons: Record<View, JSX.Element> = {
    overview: (
      <span className="material-symbols-rounded">dashboard</span>
    ),
    inventory: (
      <span className="material-symbols-rounded">inventory_2</span>
    ),
    control: (
      <span className="material-symbols-rounded">tune</span>
    ),
    priorities: (
      <span className="material-symbols-rounded">format_list_numbered</span>
    ),
    settings: (
      <span className="material-symbols-rounded">settings</span>
    ),
    debug: (
      <span className="material-symbols-rounded">bug_report</span>
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

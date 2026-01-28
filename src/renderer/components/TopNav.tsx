import type { AuthState, View } from "../types";
import { useI18n } from "../i18n";
import { cn } from "../lib/utils";

type TopNavProps = {
  view: View;
  setView: (v: View) => void;
  auth: AuthState;
  startLogin: () => void;
  logout: () => void;
};

export function TopNav({ view, setView, auth, startLogin, logout }: TopNavProps) {
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

  const icons: Record<View, string> = {
    overview: "dashboard",
    inventory: "inventory_2",
    control: "tune",
    priorities: "format_list_numbered",
    settings: "settings",
    debug: "bug_report",
  };

  return (
    <nav className="top-nav" aria-label={t("nav.title")}>
      <div className="top-nav-tabs" role="tablist">
        {navItems.map((item) => {
          const active = view === item.key;
          return (
            <button
              key={item.key}
              type="button"
              className={cn("top-nav-tab", active && "active")}
              onClick={() => setView(item.key)}
              aria-current={active ? "page" : undefined}
              title={`${item.label} - ${item.caption}`}
            >
              <span className="top-nav-icon material-symbols-rounded" aria-hidden="true">
                {icons[item.key]}
              </span>
              <span className="top-nav-label">{item.label}</span>
            </button>
          );
        })}
      </div>
      <div className="top-nav-session">
        <span className={cn("status-pill", isLinked ? "ok" : "warn")}>
          {isLinked ? t("session.connected") : t("session.disconnected")}
        </span>
        {isLinked ? (
          <button type="button" className="top-nav-action ghost" onClick={logout}>
            {t("session.logout")}
          </button>
        ) : (
          <button
            type="button"
            className="top-nav-action"
            onClick={startLogin}
            disabled={auth.status === "pending"}
          >
            {auth.status === "pending" ? t("session.login") : t("session.loginBrowser")}
          </button>
        )}
      </div>
    </nav>
  );
}

import type { AuthState, ProfileState, View } from "@renderer/shared/types";
import { useI18n } from "@renderer/shared/i18n";
import { cn } from "@renderer/shared/lib/utils";

type TopNavProps = {
  view: View;
  setView: (v: View) => void;
  auth: AuthState;
  profile: ProfileState;
  startLogin: () => void;
  logout: () => void;
  showDebug: boolean;
};

export function TopNav({
  view,
  setView,
  auth,
  profile,
  startLogin,
  logout,
  showDebug,
}: TopNavProps) {
  const { t } = useI18n();
  const isLinked = auth.status === "ok";
  const sessionDisplayName = profile.status === "ready" ? profile.displayName : "";
  const sessionAvatar = profile.status === "ready" ? profile.avatar : "";
  const sessionInitial = sessionDisplayName.trim().charAt(0).toUpperCase() || "U";
  let navItems: Array<{ key: View; label: string; caption: string }> = [
    { key: "overview", label: t("nav.overview"), caption: t("nav.overview.caption") },
    { key: "inventory", label: t("nav.inventory"), caption: t("nav.inventory.caption") },
    { key: "control", label: t("nav.control"), caption: t("nav.control.caption") },
    { key: "priorities", label: t("nav.priorities"), caption: t("nav.priorities.caption") },
    { key: "settings", label: t("nav.settings"), caption: t("nav.settings.caption") },
  ];
  if (showDebug) {
    const settingsIndex = navItems.findIndex((item) => item.key === "settings");
    const insertAt = settingsIndex >= 0 ? settingsIndex : navItems.length;
    const debugItem: { key: View; label: string; caption: string } = {
      key: "debug",
      label: t("nav.debug"),
      caption: t("nav.debug.caption"),
    };
    navItems = [...navItems.slice(0, insertAt), debugItem, ...navItems.slice(insertAt)];
  }

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
        {isLinked && profile.status === "ready" ? (
          <div className="inline-flex max-w-[220px] items-center gap-2 rounded-lg border border-border bg-background px-2 py-1">
            {sessionAvatar ? (
              <img
                src={sessionAvatar}
                alt=""
                className="h-7 w-7 rounded-full border border-border object-cover"
              />
            ) : (
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold text-foreground">
                {sessionInitial}
              </span>
            )}
            <span className="truncate text-sm font-medium text-foreground">
              {sessionDisplayName}
            </span>
          </div>
        ) : null}
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

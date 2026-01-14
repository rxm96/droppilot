import { useI18n } from "../i18n";

type Props = {
  title?: string;
};

type WindowAction = "minimize" | "maximize" | "restore" | "close" | "hide-to-tray";

export function TitleBar({ title = "DropPilot" }: Props) {
  const { t } = useI18n();
  const handle = (action: WindowAction) => {
    window.electronAPI.app.windowControl(action);
  };

  return (
    <div className="titlebar">
      <div className="titlebar-title">{title}</div>
      <div className="titlebar-actions">
        <button
          type="button"
          className="title-btn tray"
          onClick={() => handle("hide-to-tray")}
          aria-label={t("titlebar.tray")}
          title={t("titlebar.tray")}
        >
          <span>{t("titlebar.tray")}</span>
        </button>
        <button type="button" className="title-btn" onClick={() => handle("minimize")} aria-label={t("titlebar.minimize")}>
          <span>&minus;</span>
        </button>
        <button type="button" className="title-btn" onClick={() => handle("maximize")} aria-label={t("titlebar.maximize")}>
          <span>&#9723;</span>
        </button>
        <button type="button" className="title-btn close" onClick={() => handle("close")} aria-label={t("titlebar.close")}>
          <span>&#10005;</span>
        </button>
      </div>
    </div>
  );
}

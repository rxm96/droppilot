import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@renderer/shared/components/ui/button";
import { useI18n } from "@renderer/shared/i18n";
import { parseUpdateNoteSections } from "../../../shared/updateNotes";
import { resolveUpdateDialog } from "./updateDialogModel";

export type UpdateDialogProps = {
  updateStatus: { state: string; version?: string; releaseNotes?: string };
  /** The running app version, for the `v{current} → v{next}` kicker. */
  currentVersion?: string;
  /** Version the user chose "later" for (see `dismissKey`); null = none. */
  dismissedVersion: string | null;
  onLater: () => void;
  onInstall: () => void | Promise<void>;
  /** Space kept free at the top so the custom titlebar stays usable. */
  topInset?: number;
};

const FOCUSABLE = "button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])";

/** Opens when an update has finished downloading: release notes plus
 *  `later` / `restart now`. Downloading itself only shows in the titlebar. */
export function UpdateDialog({
  updateStatus,
  currentVersion,
  dismissedVersion,
  onLater,
  onInstall,
  topInset = 0,
}: UpdateDialogProps) {
  const { t } = useI18n();
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const restartRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const { state, version, releaseNotes } = updateStatus;
  const [installing, setInstalling] = useState(false);
  // A failed install moves the status to "error": drop the installing flag
  // so a later "downloaded" opens the ready dialog again.
  if (installing && state !== "downloaded") setInstalling(false);

  const mode = resolveUpdateDialog({ state, version, dismissedVersion, installing });
  const open = mode !== "hidden";
  const sections = useMemo(() => parseUpdateNoteSections(releaseNotes), [releaseNotes]);

  // Remember what had focus before the dialog opened and give it back after.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      restoreFocusRef.current?.focus();
      restoreFocusRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (mode === "ready") restartRef.current?.focus();
    else if (mode === "installing") dialogRef.current?.focus();
  }, [mode]);

  // Escape = later; Tab stays inside the dialog.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (mode !== "ready") return;
        event.preventDefault();
        onLater();
        return;
      }
      if (event.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && root.contains(active);
      if (event.shiftKey && (!inside || active === first || active === root)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mode, onLater, open]);

  if (!open) return null;

  const handleRestart = () => {
    setInstalling(true);
    void onInstall();
  };

  const isInstalling = mode === "installing";
  const kicker = isInstalling
    ? t("updateDialog.installingKicker")
    : currentVersion && version
      ? t("updateDialog.kicker", { current: currentVersion, next: version })
      : t("updateDialog.kickerShort");
  const title = isInstalling
    ? t("updateDialog.installingTitle")
    : version
      ? t("updateDialog.title", { version })
      : t("updateDialog.titleNoVersion");
  const body = isInstalling ? t("updateDialog.installingBody") : t("updateDialog.body");

  return (
    <div
      className="update-dialog-backdrop fixed inset-x-0 bottom-0 z-[200] grid place-items-center p-4"
      style={{ top: topInset }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        aria-busy={isInstalling || undefined}
        tabIndex={-1}
        className="flex max-h-full w-[520px] max-w-full flex-col rounded-[var(--dp-radius-xl)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] text-[color:var(--dp-text)] shadow-[0_24px_64px_rgba(0,0,0,0.5)] outline-none"
      >
        <div className="px-6 pt-[22px]">
          <div className="font-mono text-[11px] text-[color:var(--dp-accent)]">{kicker}</div>
          <h2 id={titleId} className="mb-1 mt-2 text-[20px] font-semibold leading-tight">
            {title}
          </h2>
          <p id={descId} className="m-0 text-[13px] leading-normal text-[color:var(--dp-text-dim)]">
            {body}
          </p>
        </div>

        {isInstalling ? (
          <div className="update-dialog-bar mx-6 mb-6 mt-5" aria-hidden="true">
            <span />
          </div>
        ) : (
          <>
            {sections.length > 0 ? (
              <div
                role="region"
                aria-label={t("updateDialog.notesLabel")}
                tabIndex={0}
                className="mx-6 mt-[18px] max-h-[260px] min-h-0 overflow-auto border-t border-[color:var(--dp-border)] pt-3.5 outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--dp-accent)]"
              >
                {sections.map((section, index) => (
                  <div key={`${section.heading ?? ""}-${index}`} className="mb-3 last:mb-0">
                    {section.heading ? (
                      <div className="mb-1.5 font-mono text-[11px] text-[color:var(--dp-text-dim)]">
                        {section.heading}
                      </div>
                    ) : null}
                    <ul className="m-0 list-disc pl-[18px] text-[13px] leading-relaxed">
                      {section.items.map((item, itemIndex) => (
                        <li key={itemIndex}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="mt-[18px] flex justify-end gap-2 border-t border-[color:var(--dp-border)] px-6 pb-5 pt-3.5">
              <Button variant="dp-outline" size="dp-lg" onClick={onLater}>
                {t("updateDialog.later")}
              </Button>
              <Button ref={restartRef} variant="dp-primary" size="dp-lg" onClick={handleRestart}>
                {t("updateDialog.restart")}
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

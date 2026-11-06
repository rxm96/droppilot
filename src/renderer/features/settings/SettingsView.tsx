import * as React from "react";
import type { FontPairId } from "@renderer/shared/fontPairs";
import type { ThemePreference } from "@renderer/shared/theme";
import type { ProfileState } from "@renderer/shared/types";
import type { UpdateChannel } from "../../../shared/updateChannels";
import { SettingsIndex } from "./SettingsIndex";
import {
  pickActiveSection,
  settingsSections,
  type SettingsSection,
  type SettingsSectionKey,
} from "./settingsSections";
import { AccountUpdatesSection } from "./sections/AccountUpdatesSection";
import { AdvancedSection } from "./sections/AdvancedSection";
import { AppearanceSection } from "./sections/AppearanceSection";
import { AppSection } from "./sections/AppSection";
import { AutopilotSection } from "./sections/AutopilotSection";
import { NotificationsSection } from "./sections/NotificationsSection";
import type { UpdateStatus } from "./sections/updateStatusLine";

type SettingsProps = {
  isLinked: boolean;
  profile: ProfileState;
  onLogout: () => void;
  onLogin: () => void;
  version: string;
  onOpenGames: () => void;
  language: "de" | "en";
  setLanguage: (val: "de" | "en") => void;
  theme: ThemePreference;
  setTheme: (val: ThemePreference) => void;
  accent: string | null;
  setAccent: (val: string | null) => void;
  fontPair: FontPairId;
  setFontPair: (val: FontPairId) => void;
  autoStart: boolean;
  setAutoStart: (val: boolean) => void;
  autoClaim: boolean;
  setAutoClaim: (val: boolean) => void;
  autoSelect: boolean;
  setAutoSelect: (val: boolean) => void;
  autoSwitchEnabled: boolean;
  setAutoSwitchEnabled: (val: boolean) => void;
  updateChannel: UpdateChannel;
  setUpdateChannel: (val: UpdateChannel) => void;
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
  webhookEnabled: boolean;
  setWebhookEnabled: (val: boolean) => void;
  webhookUrl: string;
  setWebhookUrl: (val: string) => void;
  webhookDropClaimed: boolean;
  setWebhookDropClaimed: (val: boolean) => void;
  webhookWatchError: boolean;
  setWebhookWatchError: (val: boolean) => void;
  webhookDropEndingSoon: boolean;
  setWebhookDropEndingSoon: (val: boolean) => void;
  webhookAutoSwitch: boolean;
  setWebhookAutoSwitch: (val: boolean) => void;
  webhookNewDrops: boolean;
  setWebhookNewDrops: (val: boolean) => void;
  enableBadgesEmotes: boolean;
  setEnableBadgesEmotes: (val: boolean) => void;
  allowUnlinkedGames: boolean;
  setAllowUnlinkedGames: (val: boolean) => void;
  closeToTray: boolean;
  setCloseToTray: (val: boolean) => void;
  minimizeToTray: boolean;
  setMinimizeToTray: (val: boolean) => void;
  sendTestAlert: () => void;
  refreshMinMs: number;
  refreshMaxMs: number;
  setRefreshIntervals: (minMs: number, maxMs: number) => void;
  resetAutomation: () => void;
  resetStats: () => void;
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
  updateStatus?: UpdateStatus & {
    transferred?: number;
    total?: number;
    bytesPerSecond?: number;
  };
};

/** A section heading counts as "current" once it is this close to the top (px). */
const ACTIVE_OFFSET = 96;

function findScrollParent(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null;
}

/** One scrolling settings page with a left index of its six sections. */
export function SettingsView(props: SettingsProps) {
  const showApp = !!props.showAutoStart;
  const sections = React.useMemo(() => settingsSections({ showApp }), [showApp]);
  const idOf = React.useMemo(
    () =>
      Object.fromEntries(sections.map((s) => [s.key, s.id])) as Record<SettingsSectionKey, string>,
    [sections],
  );
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [active, setActive] = React.useState<SettingsSectionKey | null>(sections[0]?.key ?? null);

  // Highlight the section being read: recompute on scroll of the app's scroll container.
  React.useEffect(() => {
    const root = rootRef.current;
    const scroller = root ? findScrollParent(root) : null;
    if (!scroller) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const containerTop = scroller.getBoundingClientRect().top;
      const positions = sections.map((s) => ({
        key: s.key,
        top:
          (document.getElementById(s.id)?.getBoundingClientRect().top ?? Infinity) - containerTop,
      }));
      const atBottom =
        scroller.scrollTop > 0 &&
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
      setActive(pickActiveSection(positions, { offset: ACTIVE_OFFSET, atBottom }));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [sections]);

  const handlePick = React.useCallback((section: SettingsSection) => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    document
      .getElementById(section.id)
      ?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    setActive(section.key);
  }, []);

  return (
    <div
      ref={rootRef}
      className="mx-auto grid w-full max-w-[1080px] grid-cols-1 items-start gap-8 pb-6 md:grid-cols-[180px_minmax(0,1fr)]"
    >
      <SettingsIndex sections={sections} active={active} onPick={handlePick} />

      <div className="flex min-w-0 flex-col gap-7">
        <AutopilotSection
          id={idOf.autopilot}
          autoClaim={props.autoClaim}
          setAutoClaim={props.setAutoClaim}
          autoSelect={props.autoSelect}
          setAutoSelect={props.setAutoSelect}
          autoSwitchEnabled={props.autoSwitchEnabled}
          setAutoSwitchEnabled={props.setAutoSwitchEnabled}
          refreshMinMs={props.refreshMinMs}
          refreshMaxMs={props.refreshMaxMs}
          setRefreshIntervals={props.setRefreshIntervals}
          allowUnlinkedGames={props.allowUnlinkedGames}
          setAllowUnlinkedGames={props.setAllowUnlinkedGames}
          enableBadgesEmotes={props.enableBadgesEmotes}
          setEnableBadgesEmotes={props.setEnableBadgesEmotes}
          onOpenGames={props.onOpenGames}
        />
        <NotificationsSection
          id={idOf.notifications}
          alertsEnabled={props.alertsEnabled}
          setAlertsEnabled={props.setAlertsEnabled}
          alertsNotifyWhileFocused={props.alertsNotifyWhileFocused}
          setAlertsNotifyWhileFocused={props.setAlertsNotifyWhileFocused}
          alertsDropClaimed={props.alertsDropClaimed}
          setAlertsDropClaimed={props.setAlertsDropClaimed}
          alertsDropEndingSoon={props.alertsDropEndingSoon}
          setAlertsDropEndingSoon={props.setAlertsDropEndingSoon}
          alertsDropEndingMinutes={props.alertsDropEndingMinutes}
          setAlertsDropEndingMinutes={props.setAlertsDropEndingMinutes}
          alertsWatchError={props.alertsWatchError}
          setAlertsWatchError={props.setAlertsWatchError}
          alertsAutoSwitch={props.alertsAutoSwitch}
          setAlertsAutoSwitch={props.setAlertsAutoSwitch}
          alertsNewDrops={props.alertsNewDrops}
          setAlertsNewDrops={props.setAlertsNewDrops}
          sendTestAlert={props.sendTestAlert}
          webhookEnabled={props.webhookEnabled}
          setWebhookEnabled={props.setWebhookEnabled}
          webhookUrl={props.webhookUrl}
          setWebhookUrl={props.setWebhookUrl}
          webhookDropClaimed={props.webhookDropClaimed}
          setWebhookDropClaimed={props.setWebhookDropClaimed}
          webhookWatchError={props.webhookWatchError}
          setWebhookWatchError={props.setWebhookWatchError}
          webhookDropEndingSoon={props.webhookDropEndingSoon}
          setWebhookDropEndingSoon={props.setWebhookDropEndingSoon}
          webhookAutoSwitch={props.webhookAutoSwitch}
          setWebhookAutoSwitch={props.setWebhookAutoSwitch}
          webhookNewDrops={props.webhookNewDrops}
          setWebhookNewDrops={props.setWebhookNewDrops}
        />
        <AppearanceSection
          id={idOf.appearance}
          theme={props.theme}
          setTheme={props.setTheme}
          accent={props.accent}
          setAccent={props.setAccent}
          fontPair={props.fontPair}
          setFontPair={props.setFontPair}
          language={props.language}
          setLanguage={props.setLanguage}
        />
        {showApp && (
          <AppSection
            id={idOf.app}
            autoStart={props.autoStart}
            setAutoStart={props.setAutoStart}
            closeToTray={props.closeToTray}
            setCloseToTray={props.setCloseToTray}
            minimizeToTray={props.minimizeToTray}
            setMinimizeToTray={props.setMinimizeToTray}
          />
        )}
        <AccountUpdatesSection
          id={idOf.account}
          isLinked={props.isLinked}
          profile={props.profile}
          onLogout={props.onLogout}
          onLogin={props.onLogin}
          version={props.version}
          showUpdateCheck={props.showUpdateCheck}
          updateStatus={props.updateStatus}
          checkUpdates={props.checkUpdates}
          downloadUpdate={props.downloadUpdate}
          installUpdate={props.installUpdate}
          updateChannel={props.updateChannel}
          setUpdateChannel={props.setUpdateChannel}
        />
        <AdvancedSection
          id={idOf.advanced}
          debugEnabled={props.debugEnabled}
          setDebugEnabled={props.setDebugEnabled}
          demoMode={props.demoMode}
          setDemoMode={props.setDemoMode}
          settingsJson={props.settingsJson}
          setSettingsJson={props.setSettingsJson}
          exportSettings={props.exportSettings}
          importSettings={props.importSettings}
          settingsInfo={props.settingsInfo}
          settingsError={props.settingsError}
          resetAutomation={props.resetAutomation}
          resetStats={props.resetStats}
        />
      </div>
    </div>
  );
}

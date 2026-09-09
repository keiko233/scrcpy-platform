import type { AppLocale } from "../../shared/locale-contracts";

/**
 * Strings owned by the main process (system tray, quit confirmation,
 * background notification). The renderer locale is persisted by
 * `AppPreferencesStore`; main-process UI like tray menus and native dialogs
 * reads the same value through this module instead of duplicating the
 * inlang message pipeline.
 */
export interface MainProcessStrings {
  appName: string;
  trayShowManager: string;
  trayQuit: string;
  quitTitle: string;
  quitWithActiveRuns: (count: number) => string;
  quitAndStop: string;
  cancel: string;
  backgroundNotificationTitle: string;
  backgroundNotificationBody: string;
}

const ZH_CN: MainProcessStrings = {
  appName: "Android Platform",
  trayShowManager: "显示主界面",
  trayQuit: "退出",
  quitTitle: "退出 Android Platform",
  quitWithActiveRuns: (count) =>
    `仍有 ${count} 个脚本正在运行。退出将停止全部脚本并断开设备连接。`,
  quitAndStop: "退出并停止",
  cancel: "取消",
  backgroundNotificationTitle: "Android Platform 仍在后台运行",
  backgroundNotificationBody: "点击托盘图标可重新打开主界面。",
};

const EN: MainProcessStrings = {
  appName: "Android Platform",
  trayShowManager: "Show Main Window",
  trayQuit: "Quit",
  quitTitle: "Quit Android Platform",
  quitWithActiveRuns: (count) =>
    count === 1
      ? "1 script is still running. Quitting will stop it and disconnect devices."
      : `${count} scripts are still running. Quitting will stop them all and disconnect devices.`,
  quitAndStop: "Quit and Stop",
  cancel: "Cancel",
  backgroundNotificationTitle: "Android Platform is still running",
  backgroundNotificationBody: "Click the tray icon to reopen the main window.",
};

/** `null` (not migrated yet) falls back to English, matching the renderer. */
export function mainStrings(locale: AppLocale | null): MainProcessStrings {
  return locale === "zh-cn" ? ZH_CN : EN;
}

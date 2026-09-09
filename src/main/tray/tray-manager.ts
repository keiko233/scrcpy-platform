import { readFileSync } from "node:fs";
import {
  Menu,
  Notification,
  Tray,
  nativeImage,
  type NativeImage,
} from "electron";

import type { AppLocale } from "../../shared/locale-contracts";
import { mainStrings } from "../l10n/main-strings";
import trayIcon1x from "./assets/tray-icon.png?asset";
import trayIcon2x from "./assets/tray-icon@2x.png?asset";
import trayIconMac1x from "./assets/tray-icon-macos.png?asset";
import trayIconMac2x from "./assets/tray-icon-macos@2x.png?asset";

export interface TrayManagerOptions {
  locale: AppLocale | null;
  onShowManager: () => void;
  onQuitRequest: () => void;
}

function buildIcon(): NativeImage {
  const isMac = process.platform === "darwin";
  const [oneXPath, twoXPath] =
    isMac
      ? [trayIconMac1x, trayIconMac2x]
      : [trayIcon1x, trayIcon2x];
  const image = nativeImage.createEmpty();
  image.addRepresentation({
    scaleFactor: 1,
    width: 16,
    height: 16,
    buffer: readFileSync(oneXPath),
  });
  image.addRepresentation({
    scaleFactor: 2,
    width: 32,
    height: 32,
    buffer: readFileSync(twoXPath),
  });
  if (isMac) {
    // macOS treats transparent template pixels as the menu-bar foreground and
    // adapts them for light/dark appearances.
    image.setTemplateImage(true);
  }
  return image;
}

/**
 * Owns the system tray icon and its menu. The tray is the persistent entry
 * point while the manager window is hidden to the background: clicking it
 * reopens the main window and its menu offers a guaranteed quit path.
 */
export class TrayManager {
  readonly #options: TrayManagerOptions;
  #locale: AppLocale | null;
  #tray: Tray | null = null;
  #contextMenu: Menu | null = null;

  constructor(options: TrayManagerOptions) {
    this.#options = options;
    this.#locale = options.locale;
    const tray = this.#createTray();
    this.#tray = tray;
    if (tray !== null) {
      // The field must be assigned before rebuilding the menu. Calling the
      // rebuild method from #createTray would observe the initial null value.
      this.#rebuildMenu();
    }
  }

  /** macOS menu bar and Windows notification area are both supported. */
  static isSupported(): boolean {
    return process.platform === "darwin" || process.platform === "win32";
  }

  get isPresent(): boolean {
    return this.#tray !== null;
  }

  setLocale(locale: AppLocale | null): void {
    this.#locale = locale;
    if (this.#tray !== null) {
      this.#rebuildMenu();
    }
  }

  /** First-time hint that the app keeps running in the background. */
  showBackgroundNotification(): void {
    const strings = mainStrings(this.#locale);
    const notification = new Notification({
      title: strings.backgroundNotificationTitle,
      body: strings.backgroundNotificationBody,
    });
    notification.on("click", () => {
      this.#options.onShowManager();
    });
    notification.show();
  }

  dispose(): void {
    this.#tray?.destroy();
    this.#tray = null;
    this.#contextMenu = null;
  }

  #createTray(): Tray | null {
    try {
      const tray = new Tray(buildIcon());
      // macOS: left click reopens the main window; the context menu is shown
      // on right click. Windows: left click pops up the menu, whose first
      // item reopens the main window.
      tray.on("click", () => {
        this.#options.onShowManager();
      });
      tray.on("right-click", () => {
        const menu = this.#contextMenu;
        if (menu !== null && !tray.isDestroyed()) {
          tray.popUpContextMenu(menu);
        }
      });
      return tray;
    } catch (error) {
      console.error("Failed to create the system tray icon", error);
      return null;
    }
  }

  #rebuildMenu(): void {
    const tray = this.#tray;
    if (tray === null || tray.isDestroyed()) {
      return;
    }
    const strings = mainStrings(this.#locale);
    const menu = Menu.buildFromTemplate([
      {
        label: strings.trayShowManager,
        click: () => {
          this.#options.onShowManager();
        },
      },
      { type: "separator" },
      {
        label: strings.trayQuit,
        click: () => {
          this.#options.onQuitRequest();
        },
      },
    ]);
    this.#contextMenu = menu;
    // Pop the menu explicitly from the right-click handler. Electron can
    // suppress the right-click event when setContextMenu is attached, which
    // makes the implicit menu path unreliable on some desktop versions.
    tray.setToolTip(strings.appName);
  }
}

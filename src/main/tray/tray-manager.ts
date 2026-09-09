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
import trayTemplate1x from "./assets/tray-template.png?asset";
import trayTemplate2x from "./assets/tray-template@2x.png?asset";

export interface TrayManagerOptions {
  locale: AppLocale | null;
  onShowManager: () => void;
  onQuitRequest: () => void;
}

function buildIcon(colored: boolean): NativeImage {
  const [oneXPath, twoXPath] = colored
    ? [trayIcon1x, trayIcon2x]
    : [trayTemplate1x, trayTemplate2x];
  const image = nativeImage.createEmpty();
  image.addRepresentation({
    scaleFactor: 1,
    buffer: readFileSync(oneXPath),
  });
  image.addRepresentation({
    scaleFactor: 2,
    buffer: readFileSync(twoXPath),
  });
  if (!colored) {
    // macOS menu bar icon: the system renders the black template image in
    // the appropriate appearance (dark or light menu bar).
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

  constructor(options: TrayManagerOptions) {
    this.#options = options;
    this.#locale = options.locale;
    this.#tray = this.#createTray();
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
  }

  #createTray(): Tray | null {
    try {
      const tray = new Tray(
        buildIcon(process.platform === "darwin"),
      );
      // macOS: left click reopens the main window; the context menu is shown
      // on right click. Windows: left click pops up the menu, whose first
      // item reopens the main window.
      tray.on("click", () => {
        this.#options.onShowManager();
      });
      this.#rebuildMenu();
      return tray;
    } catch (error) {
      console.error("Failed to create the system tray icon", error);
      return null;
    }
  }

  #rebuildMenu(): void {
    if (this.#tray === null) {
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
    this.#tray.setContextMenu(menu);
    this.#tray.setToolTip(strings.appName);
  }
}

import { BrowserWindow } from "electron";
import { join } from "node:path";

import type { ScreenRef, WindowContext } from "../../shared/window-contracts";
import { WindowContextRegistry } from "./window-context-registry";

export interface WindowManagerOptions {
  rendererUrl: string | undefined;
  preloadPath: string;
  rendererPath: string;
  onClosed: (context: WindowContext) => void;
  onBeforeClose?: (
    window: BrowserWindow,
    context: WindowContext,
  ) => Promise<boolean> | boolean;
  onReadyToShow?: (window: BrowserWindow, context: WindowContext) => void;
}

type WindowRoute = "/manager" | "/pair" | "/settings" | "/screen";

function loadRoute(
  window: BrowserWindow,
  route: WindowRoute,
  options: WindowManagerOptions,
): void {
  if (options.rendererUrl !== undefined) {
    void window.loadURL(`${options.rendererUrl}#${route}`);
    return;
  }
  void window.loadFile(join(options.rendererPath, "index.html"), {
    hash: route,
  });
}

/**
 * Creates one manager/settings window and at most one window per screen
 * instance. The target is registered before navigation, so preload bootstrap
 * cannot race a renderer route against scope registration.
 */
export class WindowManager {
  readonly #contexts: WindowContextRegistry;
  readonly #options: WindowManagerOptions;
  #manager: BrowserWindow | null = null;
  #pair: BrowserWindow | null = null;
  #settings: BrowserWindow | null = null;
  readonly #screens = new Map<string, BrowserWindow>();
  readonly #closing = new WeakSet<BrowserWindow>();

  constructor(contexts: WindowContextRegistry, options: WindowManagerOptions) {
    this.#contexts = contexts;
    this.#options = options;
  }

  openManager(): BrowserWindow {
    if (this.#manager !== null && !this.#manager.isDestroyed()) {
      this.#focus(this.#manager);
      return this.#manager;
    }
    const window = this.#create("manager");
    this.#manager = window;
    loadRoute(window, "/manager", this.#options);
    return window;
  }

  openSettings(): BrowserWindow {
    if (this.#settings !== null && !this.#settings.isDestroyed()) {
      this.#focus(this.#settings);
      return this.#settings;
    }
    const window = this.#create("settings");
    this.#settings = window;
    loadRoute(window, "/settings", this.#options);
    return window;
  }

  openPair(): BrowserWindow {
    if (this.#pair !== null && !this.#pair.isDestroyed()) {
      this.#focus(this.#pair);
      return this.#pair;
    }
    const window = this.#create("pair");
    this.#pair = window;
    loadRoute(window, "/pair", this.#options);
    return window;
  }

  openScreen(ref: ScreenRef): BrowserWindow {
    const existing = this.#screens.get(ref.screenInstanceId);
    if (existing !== undefined && !existing.isDestroyed()) {
      this.#focus(existing);
      return existing;
    }
    const window = this.#create("screen", ref);
    this.#screens.set(ref.screenInstanceId, window);
    loadRoute(window, "/screen", this.#options);
    return window;
  }

  getScreenWindow(screenInstanceId: string): BrowserWindow | null {
    const window = this.#screens.get(screenInstanceId);
    return window === undefined || window.isDestroyed() ? null : window;
  }

  hasVisibleWindow(): boolean {
    return BrowserWindow.getAllWindows().some(
      (window) => !window.isDestroyed() && !window.isMinimized(),
    );
  }

  allWindows(): BrowserWindow[] {
    return BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed());
  }

  #create(kind: "manager" | "pair" | "settings" | "screen", target?: ScreenRef): BrowserWindow {
    const window = new BrowserWindow({
      width: kind === "screen" ? 1100 : kind === "pair" ? 720 : 1200,
      height: kind === "screen" ? 760 : kind === "pair" ? 620 : 800,
      minWidth: 720,
      minHeight: 480,
      show: false,
      title:
        kind === "screen"
          ? "Android Platform · Screen"
          : kind === "pair"
            ? "Android Platform · Pair"
            : "Android Platform",
      ...(process.platform === "darwin"
        ? { titleBarStyle: "hiddenInset" as const }
        : { frame: false }),
      webPreferences: {
        preload: this.#options.preloadPath,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        devTools: this.#options.rendererUrl !== undefined,
      },
    });
    // Electron destroys `window.webContents` before emitting `closed`. Keep
    // its id while the window is alive so cleanup does not dereference a
    // destroyed WebContents instance.
    const webContentsId = window.webContents.id;
    const context = this.#contexts.register(window.webContents, kind, target);
    window.once("ready-to-show", () => {
      if (!window.isDestroyed()) {
        window.show();
        this.#options.onReadyToShow?.(window, context);
      }
    });
    window.on("maximize", () => {
      // The renderer receives the initial value via the existing query and
      // only needs a change notification after native maximize/unmaximize.
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.send("window:maximized-changed", true);
      }
    });
    window.on("unmaximize", () => {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.send("window:maximized-changed", false);
      }
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event) => {
      event.preventDefault();
    });
    if (this.#options.onBeforeClose !== undefined) {
      window.on("close", (event) => {
        if (this.#closing.has(window)) {
          this.#closing.delete(window);
          return;
        }
        event.preventDefault();
        void Promise.resolve(this.#options.onBeforeClose?.(window, context))
          .then((allow) => {
            if (allow !== true || window.isDestroyed()) {
              return;
            }
            this.#closing.add(window);
            window.close();
          })
          .catch((error) => {
            console.error("window close coordination failed", error);
          });
      });
    }
    window.on("closed", () => {
      const closedContext = this.#contexts.unregister(webContentsId);
      if (this.#manager === window) {
        this.#manager = null;
      }
      if (this.#settings === window) {
        this.#settings = null;
      }
      if (this.#pair === window) {
        this.#pair = null;
      }
      if (closedContext?.kind === "screen") {
        this.#screens.delete(closedContext.target.screenInstanceId);
      }
      if (closedContext !== null) {
        this.#options.onClosed(closedContext);
      }
    });
    return window;
  }

  #focus(window: BrowserWindow): void {
    if (window.isMinimized()) {
      window.restore();
    }
    window.show();
    window.focus();
  }
}

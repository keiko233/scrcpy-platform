import type { WebContents } from "electron";

import type { ScreenRef } from "../../shared/window-contracts";
import type { WindowContext, WindowKind } from "../../shared/window-contracts";

export class WindowContextRegistry {
  readonly #contexts = new Map<number, WindowContext>();

  register(webContents: WebContents, kind: WindowKind, target?: ScreenRef): WindowContext {
    const context: WindowContext = kind === "screen"
      ? { windowId: webContents.id, kind, target: target as ScreenRef }
      : { windowId: webContents.id, kind };
    this.#contexts.set(webContents.id, context);
    return context;
  }

  unregister(webContentsId: number): WindowContext | null {
    const context = this.#contexts.get(webContentsId) ?? null;
    this.#contexts.delete(webContentsId);
    return context;
  }

  get(webContentsId: number): WindowContext | null {
    return this.#contexts.get(webContentsId) ?? null;
  }

  getScreen(webContentsId: number): Extract<WindowContext, { kind: "screen" }> | null {
    const context = this.get(webContentsId);
    return context?.kind === "screen" ? context : null;
  }

  all(): WindowContext[] {
    return [...this.#contexts.values()];
  }
}

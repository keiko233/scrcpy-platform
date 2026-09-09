import { useEffect, useState } from "react";
import { CopyIcon, MinusIcon, SquareIcon, XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages.js";

import { useSystemPlatform } from "./use-system-platform";

const BUTTON_CLASS =
  "flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

export function WindowButtons(): React.ReactElement | null {
  const platform = useSystemPlatform();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (platform === null || platform === "darwin") {
      return;
    }
    let active = true;
    void window.scrcpyPlatform.windowIsMaximized().then((value) => {
      if (active) {
        setMaximized(value);
      }
    });
    const unsubscribe = window.scrcpyPlatform.onWindowMaximized(setMaximized);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [platform]);

  if (platform === null || platform === "darwin") {
    return null;
  }

  return (
    <div className="app-no-drag flex h-full items-stretch">
      <button
        aria-label={m.window_controls_minimize()}
        className={BUTTON_CLASS}
        onClick={() => void window.scrcpyPlatform.windowMinimize()}
        type="button"
      >
        <MinusIcon className="size-3.5" />
      </button>

      <button
        aria-label={
          maximized ? m.window_controls_restore() : m.window_controls_maximize()
        }
        className={BUTTON_CLASS}
        onClick={() => void window.scrcpyPlatform.windowToggleMaximize()}
        type="button"
      >
        {maximized ? (
          <CopyIcon className="size-3.5" />
        ) : (
          <SquareIcon className="size-3.5" />
        )}
      </button>
      <button
        aria-label={m.window_controls_close()}
        className={cn(BUTTON_CLASS, "hover:bg-red-600 hover:text-white")}
        onClick={() => void window.scrcpyPlatform.windowClose()}
        type="button"
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}

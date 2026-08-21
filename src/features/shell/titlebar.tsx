import type { ReactNode } from "react";

import { useSystemPlatform } from "./use-system-platform";
import { WindowButtons } from "./window-controls";

export function Titlebar({
  children,
  actions,
}: {
  children?: ReactNode;
  actions?: ReactNode;
}): React.ReactElement {
  const platform = useSystemPlatform();

  return (
    <header className="app-drag flex h-9 shrink-0 select-none items-center border-b bg-card">
      {platform === "darwin" ? <div className="w-[72px] shrink-0" /> : null}
      {children}
      <div className="flex-1" />
      {actions}
      <WindowButtons />
    </header>
  );
}

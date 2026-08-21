import { useEffect, useState } from "react";

import type { SystemPlatform } from "@/shared/electron-api";

export function useSystemPlatform(): SystemPlatform | null {
  const [platform, setPlatform] = useState<SystemPlatform | null>(null);

  useEffect(() => {
    let active = true;
    void window.androidPlatform.getSystemInfo().then((info) => {
      if (active) {
        setPlatform(info.platform);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return platform;
}

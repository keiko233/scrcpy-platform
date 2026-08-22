import { useSystemInfo } from "@/hooks/query/use-system-info";
import type { SystemPlatform } from "@/shared/electron-api";

export function useSystemPlatform(): SystemPlatform | null {
  const info = useSystemInfo();
  return info.data?.platform ?? null;
}
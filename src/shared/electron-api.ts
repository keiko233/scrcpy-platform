export const ELECTRON_CHANNELS = {
  systemInfo: "system:get-info",
} as const;

export type SystemPlatform = "darwin" | "win32" | "unsupported";

export interface SystemInfo {
  runtime: "electron";
  platform: SystemPlatform;
  versions: {
    electron: string;
    chrome: string;
    node: string;
  };
}

export interface ElectronAPI {
  getSystemInfo(): Promise<SystemInfo>;
}

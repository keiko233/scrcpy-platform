import type { DeviceSessionState } from "@/shared/device-contracts";

export async function getDeviceSessionState(): Promise<DeviceSessionState> {
  try {
    const session = await window.androidPlatform.getDeviceSession();
    return session.state;
  } catch {
    return "disconnected";
  }
}

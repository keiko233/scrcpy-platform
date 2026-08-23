import { z } from "zod";

export const AdbDeviceStateSchema = z.enum([
  "unauthorized",
  "offline",
  "device",
]);

export type AdbDeviceState = z.infer<typeof AdbDeviceStateSchema>;

export const AdbDeviceDtoSchema = z.object({
  transportId: z
    .string()
    .regex(/^[0-9]+$/, "transportId must be a decimal string"),
  serial: z.string(),
  state: AdbDeviceStateSchema,
  product: z.string().optional(),
  model: z.string().optional(),
  device: z.string().optional(),
});

export type AdbDeviceDto = z.infer<typeof AdbDeviceDtoSchema>;

function isWirelessAddress(value: string): boolean {
  if (/\s/.test(value)) {
    return false;
  }

  const match = /^\[([^\]]+)\]:(\d{1,5})$/.exec(value) ??
    /^([^:]+):(\d{1,5})$/.exec(value);
  if (match === null) {
    return false;
  }

  const port = Number.parseInt(match[2], 10);
  return port > 0 && port <= 65535;
}

export const WirelessAddressSchema = z
  .string()
  .trim()
  .min(3)
  .max(255)
  .refine(isWirelessAddress, "Expected a host:port address");

export const WirelessPairInputSchema = z.object({
  address: WirelessAddressSchema,
  password: z.string().regex(/^\d{6}$/, "Pairing code must be six digits"),
});

export type WirelessPairInput = z.infer<typeof WirelessPairInputSchema>;

export const WirelessConnectInputSchema = z.object({
  address: WirelessAddressSchema,
});

export type WirelessConnectInput = z.infer<typeof WirelessConnectInputSchema>;

export const WirelessOperationFailureSchema = z.enum([
  "server-unavailable",
  "unauthorized",
  "already-connected",
  "network-error",
  "operation-failed",
]);

export type WirelessOperationFailure = z.infer<
  typeof WirelessOperationFailureSchema
>;

export type WirelessOperationResult =
  | { status: "ok" }
  | {
      status: "error";
      error: WirelessOperationFailure;
      message: string;
    };

export const DeviceSessionStateSchema = z.enum([
  "disconnected",
  "connecting",
  "connected",
  "disconnecting",
  "error",
]);

export type DeviceSessionState = z.infer<typeof DeviceSessionStateSchema>;

export const DeviceSessionDtoSchema = z.object({
  sessionId: z.string().min(1),
  transportId: z
    .string()
    .regex(/^[0-9]+$/, "transportId must be a decimal string")
    .nullable(),
  serial: z.string().nullable(),
  state: DeviceSessionStateSchema,
  errorMessage: z.string().nullable(),
});

export type DeviceSessionDto = z.infer<typeof DeviceSessionDtoSchema>;

export const InstalledAppDtoSchema = z.object({
  packageName: z.string().min(1),
  name: z.string().min(1),
  system: z.boolean(),
});

export type InstalledAppDto = z.infer<typeof InstalledAppDtoSchema>;

export const InstalledAppsSnapshotSchema = z.object({
  apps: z.array(InstalledAppDtoSchema),
  pending: z.array(z.string().min(1)),
});

export type InstalledAppsSnapshot = z.infer<typeof InstalledAppsSnapshotSchema>;

export const EnrichInstalledAppsInputSchema = z.object({
  packages: z.array(z.string().min(1)).max(64),
});

export type EnrichInstalledAppsInput = z.infer<
  typeof EnrichInstalledAppsInputSchema
>;

export const ConnectDeviceInputSchema = z.object({
  transportId: z
    .string()
    .regex(/^[0-9]+$/, "transportId must be a decimal string"),
});

export type ConnectDeviceInput = z.infer<typeof ConnectDeviceInputSchema>;

export const ListDevicesFailureSchema = z.literal("server-unavailable");
export const ConnectDeviceFailureSchema = z.enum([
  "server-unavailable",
  "device-missing",
  "device-not-ready",
  "session-busy",
  "connection-failed",
]);
export const DisconnectDeviceFailureSchema = z.literal("disconnect-failed");

export type ListDevicesFailure = z.infer<typeof ListDevicesFailureSchema>;
export type ConnectDeviceFailure = z.infer<typeof ConnectDeviceFailureSchema>;
export type DisconnectDeviceFailure = z.infer<
  typeof DisconnectDeviceFailureSchema
>;

export type ListDevicesResult =
  | { status: "ok"; devices: AdbDeviceDto[] }
  | { status: "error"; error: ListDevicesFailure };

export type ConnectDeviceResult =
  | { status: "ok"; session: DeviceSessionDto }
  | { status: "error"; error: ConnectDeviceFailure };

export type DisconnectDeviceResult =
  | { status: "ok"; session: DeviceSessionDto }
  | { status: "error"; error: DisconnectDeviceFailure };

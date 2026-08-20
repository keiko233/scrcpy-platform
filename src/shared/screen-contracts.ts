import { z } from "zod";

export const ScreenStateSchema = z.enum([
  "disconnected",
  "idle",
  "starting",
  "streaming",
  "switching",
  "error",
]);
export type ScreenState = z.infer<typeof ScreenStateSchema>;

export const AndroidDisplayDtoSchema = z.object({
  displayId: z.number().int().nonnegative(),
  name: z.string().min(1),
  kind: z.enum(["physical", "virtual"]),
  primary: z.boolean(),
  ownedBySession: z.boolean(),
});
export type AndroidDisplayDto = z.infer<typeof AndroidDisplayDtoSchema>;

export const ScreenSessionDtoSchema = z.object({
  sessionId: z.string().min(1),
  serial: z.string().nullable(),
  state: ScreenStateSchema,
  displays: z.array(AndroidDisplayDtoSchema),
  activeDisplayId: z.number().int().nonnegative().nullable(),
  ownedVirtualDisplayId: z.number().int().nonnegative().nullable(),
  streamId: z.string().nullable(),
  videoCodec: z.number().int().nullable(),
  videoWidth: z.number().int().nonnegative(),
  videoHeight: z.number().int().nonnegative(),
  errorMessage: z.string().nullable(),
});
export type ScreenSessionDto = z.infer<typeof ScreenSessionDtoSchema>;

export const DisplayIdInputSchema = z.object({
  displayId: z.number().int().nonnegative(),
});
export type DisplayIdInput = z.infer<typeof DisplayIdInputSchema>;

export const CreateVirtualDisplayInputSchema = z.object({
  width: z.number().int().min(320).max(7680),
  height: z.number().int().min(320).max(7680),
  dpi: z.number().int().min(72).max(960),
  packageName: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/)
    .optional(),
});
export type CreateVirtualDisplayInput = z.infer<
  typeof CreateVirtualDisplayInputSchema
>;

export const DeviceButtonSchema = z.enum([
  "back",
  "home",
  "app-switch",
  "power",
  "volume-up",
  "volume-down",
]);
export type DeviceButton = z.infer<typeof DeviceButtonSchema>;

export const PressDeviceButtonInputSchema = z.object({
  button: DeviceButtonSchema,
});
export type PressDeviceButtonInput = z.infer<
  typeof PressDeviceButtonInputSchema
>;

export const TouchActionSchema = z.enum(["down", "move", "up", "cancel"]);
export type TouchAction = z.infer<typeof TouchActionSchema>;

export const InjectScreenTouchInputSchema = z.object({
  displayId: z.number().int().nonnegative(),
  action: TouchActionSchema,
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
export type InjectScreenTouchInput = z.infer<
  typeof InjectScreenTouchInputSchema
>;

export const RequestScreenVideoInputSchema = z.object({
  streamId: z.string().min(1),
});
export type RequestScreenVideoInput = z.infer<
  typeof RequestScreenVideoInputSchema
>;

export const ScreenFailureCodeSchema = z.enum([
  "not-connected",
  "not-streaming",
  "display-not-found",
  "virtual-display-exists",
  "busy",
  "unsupported",
  "operation-failed",
]);
export type ScreenFailureCode = z.infer<typeof ScreenFailureCodeSchema>;

export interface ScreenOperationError {
  code: ScreenFailureCode;
  message: string;
}

export type ScreenOperationResult =
  | { status: "ok"; screen: ScreenSessionDto }
  | { status: "error"; error: ScreenOperationError };

export interface ScreenVideoMetadataMessage {
  type: "metadata";
  streamId: string;
  codec: number;
}

export interface ScreenVideoPacketMessage {
  type: "packet";
  streamId: string;
  packet: {
    type: "configuration" | "data";
    keyframe?: boolean;
    pts?: bigint;
    data: Uint8Array;
  };
}

export interface ScreenVideoStoppedMessage {
  type: "stopped";
  streamId: string;
  reason?: string;
}

export type ScreenVideoMessage =
  | ScreenVideoMetadataMessage
  | ScreenVideoPacketMessage
  | ScreenVideoStoppedMessage;

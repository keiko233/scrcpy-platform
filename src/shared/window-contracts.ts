import { z } from "zod";

export const ScreenRefSchema = z
  .object({
    sessionId: z.string().min(1),
    screenInstanceId: z.string().min(1),
    displayId: z.number().int().nonnegative(),
  })
  .strict();

export type ScreenRef = z.infer<typeof ScreenRefSchema>;

export const OpenScreenInputSchema = z
  .object({
    sessionId: z.string().min(1),
    displayId: z.number().int().nonnegative(),
  })
  .strict();

export type OpenScreenInput = z.infer<typeof OpenScreenInputSchema>;

export const ListScreenDisplaysInputSchema = z
  .object({ sessionId: z.string().min(1) })
  .strict();

export type ListScreenDisplaysInput = z.infer<
  typeof ListScreenDisplaysInputSchema
>;

export const CreateVirtualScreenForDeviceInputSchema = z
  .object({
    sessionId: z.string().min(1),
    width: z.number().int().min(320).max(7680),
    height: z.number().int().min(320).max(7680),
    dpi: z.number().int().min(72).max(960),
    packageName: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/)
      .optional(),
  })
  .strict();

export type CreateVirtualScreenForDeviceInput = z.infer<
  typeof CreateVirtualScreenForDeviceInputSchema
>;

export const WindowKindSchema = z.enum(["manager", "pair", "settings", "screen"]);
export type WindowKind = z.infer<typeof WindowKindSchema>;

export const WindowContextSchema = z.discriminatedUnion("kind", [
  z
    .object({
      windowId: z.number().int().positive(),
      kind: z.literal("manager"),
    })
    .strict(),
  z
    .object({
      windowId: z.number().int().positive(),
      kind: z.literal("pair"),
    })
    .strict(),
  z
    .object({
      windowId: z.number().int().positive(),
      kind: z.literal("settings"),
    })
    .strict(),
  z
    .object({
      windowId: z.number().int().positive(),
      kind: z.literal("screen"),
      target: ScreenRefSchema,
    })
    .strict(),
]);

export type WindowContext = z.infer<typeof WindowContextSchema>;

export const WindowBootstrapResultSchema = z.object({
  context: WindowContextSchema,
});

export type WindowBootstrapResult = z.infer<
  typeof WindowBootstrapResultSchema
>;

export interface ScreenOpenResult {
  status: "ok" | "error";
  ref?: ScreenRef;
  message?: string;
}

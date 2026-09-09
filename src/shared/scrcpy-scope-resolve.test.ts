import { describe, expect, test } from "vitest";
import {
  DEFAULT_SCRCPY_SETTINGS,
  ScrcpyOverridesSchema,
  ScrcpySettingsScopeSchema,
  type ScrcpyOverrides,
  type ScrcpySettings,
} from "./screen-contracts";
import { resolveScrcpySettings } from "./scrcpy-scope-resolve";

describe("ScrcpyOverridesSchema", () => {
  test("accepts a subset of the overridable fields", () => {
    const overrides = ScrcpyOverridesSchema.parse({ maxFps: 30 });
    expect(overrides).toEqual({ maxFps: 30 });
  });

  test("accepts explicit false / null values that differ from defaults", () => {
    expect(
      ScrcpyOverridesSchema.parse({ audio: false, maxSize: null }),
    ).toEqual({ audio: false, maxSize: null });
  });

  test("rejects fields that are not overridable per scope", () => {
    expect(() =>
      ScrcpyOverridesSchema.parse({ turnScreenOff: true }),
    ).toThrow();
    expect(() =>
      ScrcpyOverridesSchema.parse({ ocrCaptureSource: "screencap" }),
    ).toThrow();
  });
});

describe("ScrcpySettingsScopeSchema", () => {
  test("parses global, device and screen scopes", () => {
    expect(ScrcpySettingsScopeSchema.parse({ scope: "global" })).toEqual({
      scope: "global",
    });
    expect(
      ScrcpySettingsScopeSchema.parse({ scope: "device", deviceKey: "serial-1" }),
    ).toEqual({ scope: "device", deviceKey: "serial-1" });
    expect(
      ScrcpySettingsScopeSchema.parse({
        scope: "screen",
        deviceKey: "serial-1",
        displayId: 2,
      }),
    ).toEqual({ scope: "screen", deviceKey: "serial-1", displayId: 2 });
  });

  test("rejects unknown keys and incomplete scopes", () => {
    expect(() =>
      ScrcpySettingsScopeSchema.parse({ scope: "device", deviceKey: "x", extra: 1 }),
    ).toThrow();
    expect(() =>
      ScrcpySettingsScopeSchema.parse({ scope: "screen", deviceKey: "x" }),
    ).toThrow();
  });
});

describe("resolveScrcpySettings", () => {
  const global: ScrcpySettings = { ...DEFAULT_SCRCPY_SETTINGS };

  test("returns a copy of global when no overrides exist", () => {
    const resolved = resolveScrcpySettings(global, undefined, undefined);
    expect(resolved).toEqual(global);
    expect(resolved).not.toBe(global);
  });

  test("device overrides win over global", () => {
    const device: ScrcpyOverrides = { maxFps: 30, videoBitRate: 4_000_000 };
    const resolved = resolveScrcpySettings(global, device, undefined);
    expect(resolved.maxFps).toBe(30);
    expect(resolved.videoBitRate).toBe(4_000_000);
    expect(resolved.videoCodec).toBe(global.videoCodec);
  });

  test("screen overrides win over device overrides", () => {
    const device: ScrcpyOverrides = { maxFps: 30, videoCodec: "h264" };
    const screen: ScrcpyOverrides = { maxFps: 120 };
    const resolved = resolveScrcpySettings(global, device, screen);
    expect(resolved.maxFps).toBe(120);
    expect(resolved.videoCodec).toBe("h264");
  });

  test("explicit false on an override layer wins over a global true", () => {
    const resolved = resolveScrcpySettings(global, { audio: false }, undefined);
    expect(resolved.audio).toBe(false);
  });

  test("applies the screen layer whenever the caller passes one", () => {
    // The registry only passes the screen layer for known physical displays;
    // the resolver itself applies whatever layers it receives.
    const screen: ScrcpyOverrides = { maxFps: 15 };
    const resolved = resolveScrcpySettings(global, undefined, screen);
    expect(resolved.maxFps).toBe(15);
  });
});

import type {
  ScrcpyOverrides,
  ScrcpySettings,
} from "./screen-contracts";

/**
 * Applies a partial override layer on top of a full settings object.
 * Override keys present (even false / 0 / null) replace the inherited value;
 * absent keys keep the inherited value.
 */
export function applyScrcpyOverrides(
  settings: ScrcpySettings,
  overrides: ScrcpyOverrides,
): ScrcpySettings {
  return { ...settings, ...overrides };
}

/**
 * Resolves the effective scrcpy settings for a target.
 *
 * Precedence (later layers win):
 *   global defaults -> device overrides -> screen overrides.
 *
 * Pass `null` for displayId when the target is not a physical display
 * (e.g. a freshly created virtual display): the screen layer is skipped.
 */
export function resolveScrcpySettings(
  global: ScrcpySettings,
  deviceOverrides: ScrcpyOverrides | null | undefined,
  screenOverrides: ScrcpyOverrides | null | undefined,
): ScrcpySettings {
  let resolved = { ...global };
  if (deviceOverrides !== undefined && deviceOverrides !== null) {
    resolved = applyScrcpyOverrides(resolved, deviceOverrides);
  }
  if (screenOverrides !== undefined && screenOverrides !== null) {
    resolved = applyScrcpyOverrides(resolved, screenOverrides);
  }
  return resolved;
}

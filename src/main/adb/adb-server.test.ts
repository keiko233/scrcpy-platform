import { describe, expect, it } from "vitest";

import { getAdbExecutableCandidates } from "./adb-server";

describe("getAdbExecutableCandidates", () => {
  it("includes PATH, SDK, and macOS fallback locations", () => {
    expect(
      getAdbExecutableCandidates({
        platform: "darwin",
        homeDirectory: "/Users/tester",
        env: {
          PATH: "/custom/bin:/other/bin",
          ANDROID_HOME: "/opt/android-sdk",
        },
      }),
    ).toEqual([
      "/custom/bin/adb",
      "/other/bin/adb",
      "/opt/android-sdk/platform-tools/adb",
      "/Users/tester/Library/Android/sdk/platform-tools/adb",
      "/opt/homebrew/bin/adb",
      "/usr/local/bin/adb",
    ]);
  });

  it("prefers an explicit ADB_PATH", () => {
    expect(
      getAdbExecutableCandidates({
        platform: "linux",
        homeDirectory: "/home/tester",
        env: {
          ADB_PATH: "/tools/adb",
          PATH: "/usr/bin",
        },
      })[0],
    ).toBe("/tools/adb");
  });
});

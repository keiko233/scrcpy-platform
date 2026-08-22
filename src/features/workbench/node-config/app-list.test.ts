import { describe, expect, it } from "vitest";

import type { InstalledAppDto } from "@/shared/device-contracts";

import {
  filterInstalledApps,
  findInstalledApp,
  normalizeAppQuery,
} from "./app-list";

const APPS: readonly InstalledAppDto[] = [
  {
    packageName: "com.example.alpha",
    name: "Alpha App",
    system: false,
  },
  {
    packageName: "com.android.settings",
    name: "Settings",
    system: true,
  },
  {
    packageName: "com.example.beta",
    name: "Beta",
    system: false,
  },
];

function packageNames(apps: readonly InstalledAppDto[]): string[] {
  return apps.map((app) => app.packageName);
}

describe("normalizeAppQuery", () => {
  it("lowercases and trims surrounding whitespace", () => {
    expect(normalizeAppQuery("  Alpha APP  ")).toBe("alpha app");
    expect(normalizeAppQuery("")).toBe("");
  });
});

describe("filterInstalledApps", () => {
  it("returns every app for an empty query", () => {
    expect(filterInstalledApps(APPS, "")).toEqual(APPS);
    expect(filterInstalledApps(APPS, "   ")).toEqual(APPS);
  });

  it("matches by app name case-insensitively", () => {
    expect(packageNames(filterInstalledApps(APPS, "settings"))).toEqual([
      "com.android.settings",
    ]);
    expect(packageNames(filterInstalledApps(APPS, "BETA"))).toEqual([
      "com.example.beta",
    ]);
  });

  it("matches by package name case-insensitively", () => {
    expect(packageNames(filterInstalledApps(APPS, "COM.EXAMPLE.ALPHA"))).toEqual(
      ["com.example.alpha"],
    );
  });

  it("matches a substring across both name and package", () => {
    expect(packageNames(filterInstalledApps(APPS, "example"))).toEqual([
      "com.example.alpha",
      "com.example.beta",
    ]);
  });

  it("trims the query before matching", () => {
    expect(packageNames(filterInstalledApps(APPS, "  alpha  "))).toEqual([
      "com.example.alpha",
    ]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterInstalledApps(APPS, "zzz")).toEqual([]);
  });
});

describe("findInstalledApp", () => {
  it("finds an exact package match", () => {
    expect(findInstalledApp(APPS, "com.android.settings")?.name).toBe(
      "Settings",
    );
  });

  it("returns null when no package matches", () => {
    expect(findInstalledApp(APPS, "com.custom.package")).toBeNull();
    expect(findInstalledApp(APPS, undefined)).toBeNull();
    expect(findInstalledApp(APPS, null)).toBeNull();
  });
});

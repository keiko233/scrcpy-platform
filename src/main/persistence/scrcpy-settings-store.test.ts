import { describe, expect, test } from "vitest";
import { DEFAULT_SCRCPY_SETTINGS } from "../../shared/screen-contracts";
import { PersistenceDatabase } from "./database";
import { ScrcpySettingsStore } from "./scrcpy-settings-store";

function makeStore() {
  const db = new PersistenceDatabase(":memory:");
  return { db, store: new ScrcpySettingsStore(db) };
}

describe("ScrcpySettingsStore", () => {
  test("starts from the default global settings", () => {
    const { db, store } = makeStore();
    try {
      const loaded = store.load();
      expect(loaded.global).toEqual(DEFAULT_SCRCPY_SETTINGS);
      expect(loaded.deviceOverrides.size).toBe(0);
      expect(loaded.screenOverrides.size).toBe(0);
    } finally {
      db.close();
    }
  });

  test("round-trips global, device and screen layers", () => {
    const { db, store } = makeStore();
    try {
      store.saveGlobal({ ...DEFAULT_SCRCPY_SETTINGS, maxFps: 90 });
      store.saveDeviceOverrides("serial-a", { maxFps: 30 });
      store.saveScreenOverrides("serial-a", 2, { videoBitRate: 4_000_000 });

      const loaded = store.load();
      expect(loaded.global.maxFps).toBe(90);
      expect(loaded.deviceOverrides.get("serial-a")).toEqual({ maxFps: 30 });
      expect(loaded.screenOverrides.get("serial-a")?.get(2)).toEqual({
        videoBitRate: 4_000_000,
      });
    } finally {
      db.close();
    }
  });

  test("empty overrides remove their row and deletion resets global defaults", () => {
    const { db, store } = makeStore();
    try {
      store.saveDeviceOverrides("serial-a", { maxFps: 30 });
      store.saveDeviceOverrides("serial-a", {});
      store.saveScreenOverrides("serial-a", 1, { audio: false });
      store.deleteScope({ scope: "screen", deviceKey: "serial-a", displayId: 1 });

      store.saveGlobal({ ...DEFAULT_SCRCPY_SETTINGS, maxFps: 90 });
      store.deleteScope({ scope: "global" });

      const loaded = store.load();
      expect(loaded.deviceOverrides.size).toBe(0);
      expect(loaded.screenOverrides.size).toBe(0);
      expect(loaded.global).toEqual(DEFAULT_SCRCPY_SETTINGS);
    } finally {
      db.close();
    }
  });

  test("heals a database whose scrcpy_settings table is missing", () => {
    const { db, store } = makeStore();
    try {
      // Emulate a half-migrated database: migrations were recorded but the
      // table itself is gone (e.g. an interrupted launch between builds).
      db.exec("DROP TABLE scrcpy_settings");

      const loaded = store.load();
      expect(loaded.global).toEqual(DEFAULT_SCRCPY_SETTINGS);
      expect(loaded.deviceOverrides.size).toBe(0);

      // Subsequent writes work on the healed table.
      store.saveDeviceOverrides("serial-b", { maxFps: 24 });
      const again = store.load();
      expect(again.deviceOverrides.get("serial-b")).toEqual({ maxFps: 24 });
    } finally {
      db.close();
    }
  });
});

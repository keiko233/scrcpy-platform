import { describe, expect, test } from "vitest";
import { PersistenceDatabase } from "./database";
import { AppPreferencesStore } from "./app-preferences-store";

describe("AppPreferencesStore", () => {
  test("keeps the locale unset until legacy renderer storage is migrated", () => {
    const db = new PersistenceDatabase(":memory:");
    try {
      expect(new AppPreferencesStore(db).getLocale()).toBeNull();
    } finally {
      db.close();
    }
  });

  test("persists the selected locale", () => {
    const db = new PersistenceDatabase(":memory:");
    try {
      const store = new AppPreferencesStore(db);
      expect(store.setLocale("zh-cn")).toBe("zh-cn");
      expect(store.getLocale()).toBe("zh-cn");
      store.setLocale("en");
      expect(store.getLocale()).toBe("en");
    } finally {
      db.close();
    }
  });
});

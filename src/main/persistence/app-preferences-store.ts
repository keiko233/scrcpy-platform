import { AppLocaleSchema, type AppLocale } from "../../shared/locale-contracts";
import type { PersistenceDatabase } from "./database";

const LOCALE_KEY = "locale";

/**
 * Small main-process-owned preference store. Keeping the locale here makes it
 * a single source of truth for every BrowserWindow rather than per-window web
 * storage.
 */
export class AppPreferencesStore {
  readonly #db: PersistenceDatabase;

  constructor(db: PersistenceDatabase) {
    this.#db = db;
  }

  getLocale(): AppLocale | null {
    const row = this.#db
      .prepare("SELECT value FROM app_preferences WHERE key = ?")
      .get(LOCALE_KEY) as { value: string } | undefined;
    if (row === undefined) {
      return null;
    }
    const parsed = AppLocaleSchema.safeParse(row.value);
    if (parsed.success) {
      return parsed.data;
    }
    console.warn("[app-preferences] Ignoring invalid persisted locale.");
    return null;
  }

  setLocale(locale: AppLocale): AppLocale {
    this.#db
      .prepare(
        `INSERT INTO app_preferences (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(LOCALE_KEY, locale, new Date().toISOString());
    return locale;
  }
}

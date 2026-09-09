import {
  DEFAULT_SCRCPY_SETTINGS,
  ScrcpyOverridesSchema,
  ScrcpySettingsSchema,
  type ScrcpyOverrides,
  type ScrcpySettings,
  type ScrcpySettingsScope,
} from "../../shared/screen-contracts";
import type { PersistenceDatabase } from "./database";

type ScopeKind = "global" | "device" | "screen";

interface SettingsRow {
  scope: ScopeKind;
  device_key: string;
  display_id: number | null;
  payload: string;
}

export interface LoadedScrcpySettings {
  /** Complete defaults, including the global-only fields. */
  global: ScrcpySettings;
  /** Keyed by ADB serial. */
  deviceOverrides: Map<string, ScrcpyOverrides>;
  /** Keyed by ADB serial, then Android display id. */
  screenOverrides: Map<string, Map<number, ScrcpyOverrides>>;
}

function emptyLoaded(): LoadedScrcpySettings {
  return {
    global: { ...DEFAULT_SCRCPY_SETTINGS },
    deviceOverrides: new Map(),
    screenOverrides: new Map(),
  };
}

function rowScope(scope: ScrcpySettingsScope): {
  scope: ScopeKind;
  deviceKey: string;
  displayId: number | null;
} {
  if (scope.scope === "global") {
    return { scope: "global", deviceKey: "", displayId: null };
  }
  if (scope.scope === "device") {
    return { scope: "device", deviceKey: scope.deviceKey, displayId: null };
  }
  return {
    scope: "screen",
    deviceKey: scope.deviceKey,
    displayId: scope.displayId,
  };
}

/**
 * Persists the layered scrcpy settings in SQLite. One row exists per scope:
 * - global rows carry the full settings object;
 * - device/screen rows carry only the overridden fields (partial objects).
 */
export class ScrcpySettingsStore {
  readonly #db: PersistenceDatabase;

  constructor(db: PersistenceDatabase) {
    this.#db = db;
  }

  load(): LoadedScrcpySettings {
    this.#ensureReady();
    const loaded = emptyLoaded();
    const rows = this.#db
      .prepare(
        `SELECT scope, device_key, display_id, payload
         FROM scrcpy_settings
         ORDER BY scope, device_key, display_id`,
      )
      .all() as unknown as SettingsRow[];

    for (const row of rows) {
      if (row.scope === "global") {
        const parsed = safeParse(row.payload, ScrcpySettingsSchema);
        if (parsed !== null) {
          loaded.global = parsed;
        } else {
          console.warn("[scrcpy-settings] Ignoring invalid global settings row.");
        }
        continue;
      }
      if (row.device_key.length === 0) {
        continue;
      }
      const overrides = safeParse(row.payload, ScrcpyOverridesSchema);
      if (overrides === null) {
        console.warn("[scrcpy-settings] Ignoring invalid overrides row.", {
          scope: row.scope,
          deviceKey: row.device_key,
          displayId: row.display_id,
        });
        continue;
      }
      if (row.scope === "device") {
        loaded.deviceOverrides.set(row.device_key, overrides);
      } else if (row.scope === "screen" && row.display_id !== null) {
        const byDisplay =
          loaded.screenOverrides.get(row.device_key) ??
          new Map<number, ScrcpyOverrides>();
        byDisplay.set(row.display_id, overrides);
        loaded.screenOverrides.set(row.device_key, byDisplay);
      }
    }
    return loaded;
  }

  saveGlobal(settings: ScrcpySettings): void {
    this.#ensureReady();
    this.#write({ scope: "global", deviceKey: "", displayId: null }, settings);
  }

  saveDeviceOverrides(deviceKey: string, overrides: ScrcpyOverrides): void {
    this.#ensureReady();
    this.#writeOverrides(
      { scope: "device", deviceKey, displayId: null },
      overrides,
    );
  }

  saveScreenOverrides(
    deviceKey: string,
    displayId: number,
    overrides: ScrcpyOverrides,
  ): void {
    this.#ensureReady();
    this.#writeOverrides(
      { scope: "screen", deviceKey, displayId },
      overrides,
    );
  }

  deleteScope(scope: ScrcpySettingsScope): void {
    this.#ensureReady();
    const target = rowScope(scope);
    this.#db.execTransaction(() => {
      this.#db
        .prepare(
          `DELETE FROM scrcpy_settings
           WHERE scope = ? AND device_key = ?
             AND display_id IS ?`,
        )
        .run(target.scope, target.deviceKey, target.displayId);
      if (scope.scope === "global") {
        // The global defaults always exist as the fallback layer.
        this.#insertGlobal();
      }
    });
  }

  /**
   * Heals databases that missed the scrcpy-settings migration (for example a
   * build that launched between schema and registry changes). Idempotent.
   */
  #ensureReady(): void {
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS scrcpy_settings (
        scope TEXT NOT NULL CHECK (scope IN ('global', 'device', 'screen')),
        device_key TEXT NOT NULL DEFAULT '',
        display_id INTEGER,
        payload TEXT NOT NULL CHECK (json_valid(payload)),
        updated_at TEXT NOT NULL,
        PRIMARY KEY (scope, device_key, display_id)
      );
    `);
    const existing = this.#db
      .prepare("SELECT 1 FROM scrcpy_settings WHERE scope = 'global'")
      .get();
    if (existing === undefined) {
      this.#db
        .prepare(
          `INSERT INTO scrcpy_settings (scope, device_key, display_id, payload, updated_at)
           VALUES ('global', '', NULL, ?, ?)`,
        )
        .run(
          JSON.stringify(DEFAULT_SCRCPY_SETTINGS),
          new Date().toISOString(),
        );
    }
  }

  #writeOverrides(
    target: { scope: ScopeKind; deviceKey: string; displayId: number | null },
    overrides: ScrcpyOverrides,
  ): void {
    if (Object.keys(overrides).length === 0) {
      this.#db.execTransaction(() => {
        this.#deleteRow(target);
      });
      return;
    }
    this.#write(target, overrides);
  }

  #write(
    target: { scope: ScopeKind; deviceKey: string; displayId: number | null },
    payload: ScrcpySettings | ScrcpyOverrides,
  ): void {
    this.#db.execTransaction(() => {
      this.#deleteRow(target);
      this.#db
        .prepare(
          `INSERT INTO scrcpy_settings (scope, device_key, display_id, payload, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          target.scope,
          target.deviceKey,
          target.displayId,
          JSON.stringify(payload),
          new Date().toISOString(),
        );
    });
  }

  #insertGlobal(): void {
    this.#db
      .prepare(
        `INSERT INTO scrcpy_settings (scope, device_key, display_id, payload, updated_at)
         VALUES ('global', '', NULL, ?, ?)`,
      )
      .run(JSON.stringify(DEFAULT_SCRCPY_SETTINGS), new Date().toISOString());
  }

  #deleteRow(target: {
    scope: ScopeKind;
    deviceKey: string;
    displayId: number | null;
  }): void {
    this.#db
      .prepare(
        `DELETE FROM scrcpy_settings
         WHERE scope = ? AND device_key = ?
           AND display_id IS ?`,
      )
      .run(target.scope, target.deviceKey, target.displayId);
  }
}

function safeParse<T>(raw: string, schema: { parse: (value: unknown) => T }): T | null {
  try {
    return schema.parse(JSON.parse(raw));
  } catch (error) {
    console.warn("[scrcpy-settings] Invalid stored payload.", error);
    return null;
  }
}

import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_SCRCPY_SETTINGS } from "../../shared/screen-contracts";

export interface Migration {
  version: number;
  name: string;
  up: (db: DatabaseSync) => void;
}

const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "initial-schema",
    up: (db) => {
      db.exec(`
        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE scripts (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          path TEXT NOT NULL,
          draft_version INTEGER NOT NULL CHECK (draft_version >= 1),
          draft_document TEXT NOT NULL CHECK (json_valid(draft_document)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (project_id, path)
        );

        CREATE INDEX idx_scripts_project_id ON scripts (project_id);

        CREATE TABLE script_revisions (
          id TEXT PRIMARY KEY,
          script_id TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
          revision_number INTEGER NOT NULL CHECK (revision_number >= 1),
          draft_document TEXT NOT NULL CHECK (json_valid(draft_document)),
          draft_version INTEGER NOT NULL CHECK (draft_version >= 1),
          message TEXT,
          created_at TEXT NOT NULL,
          UNIQUE (script_id, revision_number)
        );

        CREATE INDEX idx_script_revisions_script_id ON script_revisions (script_id);
      `);
    },
  },
  {
    version: 2,
    name: "scrcpy-settings",
    up: (db) => {
      // Idempotent on purpose: a partially migrated database (for example a
      // table created by an interrupted earlier run) must be healable.
      db.exec(`
        CREATE TABLE IF NOT EXISTS scrcpy_settings (
          scope TEXT NOT NULL CHECK (scope IN ('global', 'device', 'screen')),
          device_key TEXT NOT NULL DEFAULT '',
          display_id INTEGER,
          payload TEXT NOT NULL CHECK (json_valid(payload)),
          updated_at TEXT NOT NULL,
          PRIMARY KEY (scope, device_key, display_id)
        );
      `);
      const existing = db
        .prepare("SELECT 1 FROM scrcpy_settings WHERE scope = 'global'")
        .get();
      if (existing === undefined) {
        db.prepare(
          `INSERT INTO scrcpy_settings (scope, device_key, display_id, payload, updated_at)
           VALUES ('global', '', NULL, ?, ?)`,
        ).run(
          JSON.stringify(DEFAULT_SCRCPY_SETTINGS),
          new Date().toISOString(),
        );
      }
    },
  },
  {
    version: 3,
    name: "app-preferences",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS app_preferences (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
    },
  },
];

export function runMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const rows = db.prepare("SELECT version FROM schema_migrations").all() as Array<{
    version: number;
  }>;
  const applied = new Set(rows.map((row) => row.version));

  for (const migration of [...MIGRATIONS].sort((a, b) => a.version - b.version)) {
    if (applied.has(migration.version)) {
      continue;
    }

    db.exec("BEGIN IMMEDIATE");
    try {
      migration.up(db);
      db.prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)").run(
        migration.version,
        migration.name,
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

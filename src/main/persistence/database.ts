import { DatabaseSync, type StatementSync } from "node:sqlite";
import { runMigrations } from "./migrations";

export class PersistenceDatabase {
  readonly #db: DatabaseSync;
  readonly #isMemory: boolean;

  constructor(path: string) {
    this.#isMemory = path === ":memory:";
    this.#db = new DatabaseSync(path);
    try {
      this.#configure();
      runMigrations(this.#db);
    } catch (error) {
      this.#db.close();
      throw error;
    }
  }

  #configure(): void {
    this.#db.exec("PRAGMA foreign_keys = ON");
    this.#db.exec("PRAGMA busy_timeout = 5000");
    if (!this.#isMemory) {
      this.#db.exec("PRAGMA journal_mode = WAL");
    }
  }

  prepare(sql: string): StatementSync {
    return this.#db.prepare(sql);
  }

  exec(sql: string): void {
    this.#db.exec(sql);
  }

  execTransaction<T>(fn: () => T): T {
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.#db.exec("COMMIT");
      return result;
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.#db.close();
  }
}

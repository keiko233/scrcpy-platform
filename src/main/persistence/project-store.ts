import { randomUUID } from "node:crypto";
import {
  EMPTY_FLOW_DOCUMENT,
  type FlowDocument,
  type ProjectDto,
  type RevisionDto,
  type ScriptDto,
} from "../../shared/project-contracts";
import type { PersistenceDatabase } from "./database";

const INITIAL_DRAFT_VERSION = 1;

export type NotFoundKind = "project" | "script" | "revision";

export class NotFoundError extends Error {
  readonly kind: NotFoundKind;

  constructor(kind: NotFoundKind, message?: string) {
    super(message ?? `The requested ${kind} does not exist.`);
    this.kind = kind;
  }
}

export class StaleDraftError extends Error {
  constructor() {
    super("Cannot save draft: the script changed since it was last read.");
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
  }
}

interface ScriptRow {
  id: string;
  project_id: string;
  name: string;
  path: string;
  draft_version: number;
  draft_document: string;
  created_at: string;
  updated_at: string;
}

interface RevisionRow {
  id: string;
  script_id: string;
  revision_number: number;
  draft_document: string;
  draft_version: number;
  message: string | null;
  created_at: string;
}

export class ProjectStore {
  readonly #db: PersistenceDatabase;

  constructor(db: PersistenceDatabase) {
    this.#db = db;
  }

  createProject(input: { name: string }): ProjectDto {
    const id = randomUUID();
    const now = nowIso();
    this.#db
      .prepare(
        "INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
      )
      .run(id, input.name, now, now);
    return { id, name: input.name, createdAt: now, updatedAt: now };
  }

  listProjects(): ProjectDto[] {
    const rows = this.#db
      .prepare("SELECT id, name, created_at, updated_at FROM projects ORDER BY created_at, id")
      .all() as Array<{
      id: string;
      name: string;
      created_at: string;
      updated_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  createScript(input: { projectId: string; name: string; path: string }): ScriptDto {
    const project = this.#db
      .prepare("SELECT id FROM projects WHERE id = ?")
      .get(input.projectId) as { id: string } | undefined;
    if (!project) {
      throw new NotFoundError("project");
    }

    const existing = this.#db
      .prepare("SELECT 1 FROM scripts WHERE project_id = ? AND path = ?")
      .get(input.projectId, input.path);
    if (existing) {
      throw new ConflictError(
        `A script with path "${input.path}" already exists in this project.`,
      );
    }

    const id = randomUUID();
    const now = nowIso();
    this.#db
      .prepare(
        `INSERT INTO scripts
           (id, project_id, name, path, draft_version, draft_document, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.projectId,
        input.name,
        input.path,
        INITIAL_DRAFT_VERSION,
        JSON.stringify(EMPTY_FLOW_DOCUMENT),
        now,
        now,
      );
    return this.getScript({ scriptId: id }) as ScriptDto;
  }

  listScripts(input: { projectId: string }): ScriptDto[] {
    const rows = this.#db
      .prepare(
        `SELECT id, project_id, name, path, draft_version, draft_document, created_at, updated_at
         FROM scripts
         WHERE project_id = ?
         ORDER BY path, id`,
      )
      .all(input.projectId) as unknown as ScriptRow[];
    return rows.map(mapScript);
  }

  getScript(input: { scriptId: string }): ScriptDto | null {
    const row = this.#getScriptRow(input.scriptId);
    return row ? mapScript(row) : null;
  }

  saveScriptDraft(input: {
    scriptId: string;
    expectedDraftVersion: number;
    document: FlowDocument;
  }): ScriptDto {
    const serialized = JSON.stringify(input.document);
    const updatedAt = nowIso();
    const result = this.#db
      .prepare(
        `UPDATE scripts
         SET draft_document = ?, draft_version = draft_version + 1, updated_at = ?
         WHERE id = ? AND draft_version = ?`,
      )
      .run(serialized, updatedAt, input.scriptId, input.expectedDraftVersion);

    if (Number(result.changes) !== 1) {
      const exists = this.#db
        .prepare("SELECT 1 FROM scripts WHERE id = ?")
        .get(input.scriptId);
      if (!exists) {
        throw new NotFoundError("script");
      }
      throw new StaleDraftError();
    }

    return mapScript(this.#getScriptRow(input.scriptId) as ScriptRow);
  }

  createRevision(input: {
    scriptId: string;
    message?: string | null;
  }): RevisionDto {
    return this.#db.execTransaction(() => {
      const script = this.#getScriptRow(input.scriptId);
      if (!script) {
        throw new NotFoundError("script");
      }

      const current = this.#db
        .prepare(
          "SELECT COALESCE(MAX(revision_number), 0) AS last_number FROM script_revisions WHERE script_id = ?",
        )
        .get(input.scriptId) as { last_number: number };
      const revisionNumber = Number(current.last_number) + 1;
      const id = randomUUID();
      const createdAt = nowIso();

      this.#db
        .prepare(
          `INSERT INTO script_revisions
             (id, script_id, revision_number, draft_document, draft_version, message, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.scriptId,
          revisionNumber,
          script.draft_document,
          script.draft_version,
          input.message ?? null,
          createdAt,
        );

      return mapRevision({
        id,
        script_id: input.scriptId,
        revision_number: revisionNumber,
        draft_document: script.draft_document,
        draft_version: script.draft_version,
        message: input.message ?? null,
        created_at: createdAt,
      });
    });
  }

  listRevisions(input: { scriptId: string }): RevisionDto[] {
    const rows = this.#db
      .prepare(
        `SELECT id, script_id, revision_number, draft_document, draft_version, message, created_at
         FROM script_revisions
         WHERE script_id = ?
         ORDER BY revision_number, id`,
      )
      .all(input.scriptId) as unknown as RevisionRow[];
    return rows.map(mapRevision);
  }

  restoreRevision(input: {
    scriptId: string;
    revisionId: string;
    expectedDraftVersion: number;
  }): ScriptDto {
    return this.#db.execTransaction(() => {
      const script = this.#getScriptRow(input.scriptId);
      if (!script) {
        throw new NotFoundError("script");
      }

      const revision = this.#db
        .prepare(
          `SELECT id, script_id, revision_number, draft_document, draft_version, message, created_at
           FROM script_revisions
           WHERE id = ? AND script_id = ?`,
        )
        .get(input.revisionId, input.scriptId) as RevisionRow | undefined;
      if (!revision) {
        throw new NotFoundError("revision");
      }

      const updatedAt = nowIso();
      const result = this.#db
        .prepare(
          `UPDATE scripts
           SET draft_document = ?, draft_version = draft_version + 1, updated_at = ?
           WHERE id = ? AND draft_version = ?`,
        )
        .run(
          revision.draft_document,
          updatedAt,
          input.scriptId,
          input.expectedDraftVersion,
        );

      if (Number(result.changes) !== 1) {
        throw new StaleDraftError();
      }

      return mapScript(this.#getScriptRow(input.scriptId) as ScriptRow);
    });
  }

  #getScriptRow(scriptId: string): ScriptRow | undefined {
    return this.#db
      .prepare(
        `SELECT id, project_id, name, path, draft_version, draft_document, created_at, updated_at
         FROM scripts
         WHERE id = ?`,
      )
      .get(scriptId) as ScriptRow | undefined;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function mapScript(row: ScriptRow): ScriptDto {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    path: row.path,
    draftVersion: row.draft_version,
    draftDocument: JSON.parse(row.draft_document) as FlowDocument,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRevision(row: RevisionRow): RevisionDto {
  return {
    id: row.id,
    scriptId: row.script_id,
    revisionNumber: row.revision_number,
    draftDocument: JSON.parse(row.draft_document) as FlowDocument,
    draftVersion: row.draft_version,
    message: row.message,
    createdAt: row.created_at,
  };
}

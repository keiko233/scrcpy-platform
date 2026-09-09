import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, describe, test } from "vitest";
import {
  CreateRevisionInputSchema,
  CreateScriptInputSchema,
  FlowDocumentSchema,
  RestoreRevisionInputSchema,
  type FlowDocument,
} from "../../shared/project-contracts";
import { PersistenceDatabase } from "./database";
import { NotFoundError, ProjectStore, StaleDraftError } from "./project-store";

function documentOf(nodeIds: string[]): FlowDocument {
  return {
    schemaVersion: 1,
    nodes: nodeIds.map((id, index) => ({
      id,
      type: "delay",
      position: { x: index * 200, y: 0 },
      data: { kind: "delay", ms: 0 },
    })),
    edges: [],
  };
}

function nodeIdsOf(document: FlowDocument): string[] {
  return document.nodes.map((node) => node.id);
}

interface Fixture {
  db: PersistenceDatabase;
  store: ProjectStore;
}

function makeFixture(dbPath: string | PersistenceDatabase = ":memory:"): Fixture {
  const db = dbPath instanceof PersistenceDatabase ? dbPath : new PersistenceDatabase(dbPath);
  return { db, store: new ProjectStore(db) };
}

function makeProjectWithScript(dbPath = ":memory:") {
  const fixture = makeFixture(dbPath);
  const project = fixture.store.createProject({ name: "Demo Project" });
  const script = fixture.store.createScript({
    projectId: project.id,
    name: "Main Flow",
    path: "/flows/main.json",
  });
  return { ...fixture, project, script };
}

function assertThrowsError(
  fn: () => unknown,
  predicate: (error: unknown) => boolean,
  message?: string,
): void {
  let didThrow = false;
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    didThrow = true;
    caught = error;
  }
  assert.ok(didThrow, message ?? "expected fn to throw");
  assert.ok(predicate(caught), message);
}

describe("ProjectStore", () => {
  test("migrations apply once and are idempotent across reopenings", () => {
    const dir = mkdtempSync(join(tmpdir(), "scrcpy-platform-test-"));
    const dbPath = join(dir, "test.sqlite3");
    try {
      const first = new PersistenceDatabase(dbPath);
      const journal = first.prepare("PRAGMA journal_mode").get() as {
        journal_mode: string;
      };
      assert.equal(journal.journal_mode, "wal");
      const firstCount = first.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get() as {
        n: number;
      };
      assert.equal(Number(firstCount.n), 3);
      first.close();

      const second = new PersistenceDatabase(dbPath);
      const secondCount = second.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get() as {
        n: number;
      };
      assert.equal(Number(secondCount.n), 3);
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a project owns multiple scripts with unique stable ids", () => {
    const { db, store, project, script } = makeProjectWithScript();
    try {
      const other = store.createScript({
        projectId: project.id,
        name: "Helpers",
        path: "/flows/helpers.json",
      });
      const scripts = store.listScripts({ projectId: project.id });

      assert.equal(scripts.length, 2);
      assert.equal(new Set(scripts.map((s) => s.id)).size, 2);
      assert.equal(scripts[0].path, "/flows/helpers.json");
      assert.equal(scripts[1].path, "/flows/main.json");
      assert.equal(script.id !== other.id, true);
      assert.equal(script.draftVersion, 1);
    } finally {
      db.close();
    }
  });

  test("scripts cannot be created for a missing project or duplicate path", () => {
    const { db, store, project } = makeProjectWithScript();
    try {
      assertThrowsError(
        () => store.createScript({ projectId: "missing", name: "X", path: "/x.json" }),
        (error: unknown) =>
          error instanceof NotFoundError && error.kind === "project",
      );
      assert.throws(
        () =>
          store.createScript({
            projectId: project.id,
            name: "Duplicate",
            path: "/flows/main.json",
          }),
        /already exists/,
      );
    } finally {
      db.close();
    }
  });

  test("saveScriptDraft rejects stale drafts with optimistic concurrency", () => {
    const { db, store, script } = makeProjectWithScript();
    try {
      const firstSave = store.saveScriptDraft({
        scriptId: script.id,
        expectedDraftVersion: 1,
        document: documentOf(["a"]),
      });
      assert.equal(firstSave.draftVersion, 2);

      assert.throws(
        () =>
          store.saveScriptDraft({
            scriptId: script.id,
            expectedDraftVersion: 1,
            document: documentOf(["stale"]),
          }),
        StaleDraftError,
      );

      const secondSave = store.saveScriptDraft({
        scriptId: script.id,
        expectedDraftVersion: 2,
        document: documentOf(["a", "b"]),
      });
      assert.equal(secondSave.draftVersion, 3);
      assert.deepEqual(nodeIdsOf(secondSave.draftDocument), ["a", "b"]);

      assert.throws(
        () =>
          store.saveScriptDraft({
            scriptId: "missing",
            expectedDraftVersion: 1,
            document: documentOf([]),
          }),
        NotFoundError,
      );
    } finally {
      db.close();
    }
  });

  test("revisions are immutable snapshots numbered monotonically per script", () => {
    const { db, store, project, script } = makeProjectWithScript();
    try {
      const firstSave = store.saveScriptDraft({
        scriptId: script.id,
        expectedDraftVersion: 1,
        document: documentOf(["a"]),
      });
      const revisionOne = store.createRevision({
        scriptId: script.id,
        message: "first snapshot",
      });
      assert.equal(revisionOne.revisionNumber, 1);
      assert.deepEqual(nodeIdsOf(revisionOne.draftDocument), ["a"]);
      assert.equal(revisionOne.draftVersion, 2);
      assert.equal(revisionOne.message, "first snapshot");

      const secondSave = store.saveScriptDraft({
        scriptId: script.id,
        expectedDraftVersion: firstSave.draftVersion,
        document: documentOf(["a", "b"]),
      });
      const revisionTwo = store.createRevision({ scriptId: script.id });
      assert.equal(revisionTwo.revisionNumber, 2);
      assert.deepEqual(nodeIdsOf(revisionTwo.draftDocument), ["a", "b"]);
      assert.equal(revisionTwo.draftVersion, 3);
      assert.equal(revisionTwo.message, null);

      store.saveScriptDraft({
        scriptId: script.id,
        expectedDraftVersion: secondSave.draftVersion,
        document: documentOf(["a", "b", "c"]),
      });

      const revisions = store.listRevisions({ scriptId: script.id });
      assert.deepEqual(
        revisions.map((revision) => revision.revisionNumber),
        [1, 2],
      );
      assert.deepEqual(
        revisions.map((revision) => nodeIdsOf(revision.draftDocument)),
        [["a"], ["a", "b"]],
      );
      assert.deepEqual(
        revisions.map((revision) => revision.draftVersion),
        [2, 3],
      );
      assert.deepEqual(
        revisions.map((revision) => revision.message),
        ["first snapshot", null],
      );

      const secondScript = store.createScript({
        projectId: project.id,
        name: "Other Flow",
        path: "/flows/other.json",
      });
      const otherRevision = store.createRevision({ scriptId: secondScript.id });
      assert.equal(otherRevision.revisionNumber, 1);

      assert.throws(
        () => store.createRevision({ scriptId: "missing" }),
        NotFoundError,
      );
    } finally {
      db.close();
    }
  });

  test("restoring a revision rewrites the draft, bumps the version, and never mutates revisions", () => {
    const { db, store, project, script } = makeProjectWithScript();
    try {
      const firstSave = store.saveScriptDraft({
        scriptId: script.id,
        expectedDraftVersion: 1,
        document: documentOf(["a"]),
      });
      const revisionOne = store.createRevision({
        scriptId: script.id,
        message: "snapshot one",
      });
      const secondSave = store.saveScriptDraft({
        scriptId: script.id,
        expectedDraftVersion: firstSave.draftVersion,
        document: documentOf(["x", "y"]),
      });
      const revisionTwo = store.createRevision({ scriptId: script.id });

      const revisionsBefore = store.listRevisions({ scriptId: script.id });

      const restored = store.restoreRevision({
        scriptId: script.id,
        revisionId: revisionOne.id,
        expectedDraftVersion: secondSave.draftVersion,
      });
      assert.equal(restored.draftVersion, secondSave.draftVersion + 1);
      assert.deepEqual(nodeIdsOf(restored.draftDocument), ["a"]);

      const revisionsAfter = store.listRevisions({ scriptId: script.id });
      assert.equal(revisionsAfter.length, revisionsBefore.length);
      assert.deepEqual(
        revisionsAfter.map((revision) => nodeIdsOf(revision.draftDocument)),
        [["a"], ["x", "y"]],
      );
      assert.deepEqual(
        revisionsAfter.map((revision) => revision.draftVersion),
        [2, 3],
      );
      assert.deepEqual(
        revisionsAfter.map((revision) => revision.message),
        ["snapshot one", null],
      );

      assert.deepEqual(
        nodeIdsOf(revisionTwo.draftDocument),
        ["x", "y"],
        "snapshot documents remain untouched",
      );

      assertThrowsError(
        () =>
          store.restoreRevision({
            scriptId: script.id,
            revisionId: "missing-revision",
            expectedDraftVersion: secondSave.draftVersion,
          }),
        (error: unknown) =>
          error instanceof NotFoundError && error.kind === "revision",
      );
      assertThrowsError(
        () =>
          store.restoreRevision({
            scriptId: "missing-script",
            revisionId: revisionOne.id,
            expectedDraftVersion: secondSave.draftVersion,
          }),
        (error: unknown) =>
          error instanceof NotFoundError && error.kind === "script",
      );

      const otherScript = store.createScript({
        projectId: project.id,
        name: "Other Flow",
        path: "/flows/other.json",
      });
      assertThrowsError(
        () =>
          store.restoreRevision({
            scriptId: otherScript.id,
            revisionId: revisionOne.id,
            expectedDraftVersion: 1,
          }),
        (error: unknown) =>
          error instanceof NotFoundError && error.kind === "revision",
        "a revision belonging to another script maps to revision-not-found",
      );
    } finally {
      db.close();
    }
  });

  test("restoring with a stale expectedDraftVersion cannot overwrite a newer draft", () => {
    const { db, store, script } = makeProjectWithScript();
    try {
      const firstSave = store.saveScriptDraft({
        scriptId: script.id,
        expectedDraftVersion: 1,
        document: documentOf(["a"]),
      });
      const revisionOne = store.createRevision({ scriptId: script.id });

      store.saveScriptDraft({
        scriptId: script.id,
        expectedDraftVersion: firstSave.draftVersion,
        document: documentOf(["x", "y"]),
      });

      assert.throws(
        () =>
          store.restoreRevision({
            scriptId: script.id,
            revisionId: revisionOne.id,
            expectedDraftVersion: firstSave.draftVersion,
          }),
        StaleDraftError,
      );

      const afterStale = store.getScript({ scriptId: script.id });
      assert.equal(afterStale?.draftVersion, 3);
      assert.deepEqual(nodeIdsOf(afterStale?.draftDocument as FlowDocument), [
        "x",
        "y",
      ]);

      const restored = store.restoreRevision({
        scriptId: script.id,
        revisionId: revisionOne.id,
        expectedDraftVersion: 3,
      });
      assert.equal(restored.draftVersion, 4);
      assert.deepEqual(nodeIdsOf(restored.draftDocument), ["a"]);
    } finally {
      db.close();
    }
  });

  test("renaming a project updates the name and throws for missing projects", () => {
    const { db, store, project } = makeProjectWithScript();
    try {
      const renamed = store.renameProject({
        projectId: project.id,
        name: "Renamed Project",
      });
      assert.equal(renamed.id, project.id);
      assert.equal(renamed.name, "Renamed Project");
      assert.equal(
        store.listProjects().find((item) => item.id === project.id)?.name,
        "Renamed Project",
      );
      assertThrowsError(
        () => store.renameProject({ projectId: "missing", name: "X" }),
        (error: unknown) =>
          error instanceof NotFoundError && error.kind === "project",
      );
    } finally {
      db.close();
    }
  });

  test("deleting a project cascades to its scripts and revisions", () => {
    const { db, store, project, script } = makeProjectWithScript();
    try {
      store.createRevision({ scriptId: script.id, message: "keep" });
      store.deleteProject({ projectId: project.id });
      assert.equal(store.listProjects().length, 0);
      assert.equal(store.listScripts({ projectId: project.id }).length, 0);
      assert.equal(store.getScript({ scriptId: script.id }), null);
      assert.equal(store.listRevisions({ scriptId: script.id }).length, 0);
      assertThrowsError(
        () => store.deleteProject({ projectId: "missing" }),
        (error: unknown) =>
          error instanceof NotFoundError && error.kind === "project",
      );
    } finally {
      db.close();
    }
  });

  test("renaming a script updates the name and throws for missing scripts", () => {
    const { db, store, script } = makeProjectWithScript();
    try {
      const renamed = store.renameScript({
        scriptId: script.id,
        name: "Renamed Flow",
      });
      assert.equal(renamed.id, script.id);
      assert.equal(renamed.name, "Renamed Flow");
      assert.equal(renamed.draftVersion, script.draftVersion);
      assertThrowsError(
        () => store.renameScript({ scriptId: "missing", name: "X" }),
        (error: unknown) =>
          error instanceof NotFoundError && error.kind === "script",
      );
    } finally {
      db.close();
    }
  });

  test("deleting a script removes it together with its revisions", () => {
    const { db, store, project, script } = makeProjectWithScript();
    try {
      store.createRevision({ scriptId: script.id, message: "keep" });
      store.deleteScript({ scriptId: script.id });
      assert.equal(store.getScript({ scriptId: script.id }), null);
      assert.equal(store.listRevisions({ scriptId: script.id }).length, 0);
      assert.equal(store.listScripts({ projectId: project.id }).length, 0);
      assertThrowsError(
        () => store.deleteScript({ scriptId: "missing" }),
        (error: unknown) =>
          error instanceof NotFoundError && error.kind === "script",
      );
    } finally {
      db.close();
    }
  });

  test("database CHECK constraints guard version numbers and JSON documents", () => {
    const db = new PersistenceDatabase(":memory:");
    try {
      db.exec(
        "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p1', 'P', 't', 't')",
      );
      const validJson = '{"schemaVersion":1,"nodes":[],"edges":[]}';
      db.exec(
        `INSERT INTO scripts (id, project_id, name, path, draft_version, draft_document, created_at, updated_at)
         VALUES ('s3', 'p1', 'S', '/s3.json', 1, '${validJson}', 't', 't')`,
      );

      assert.throws(
        () =>
          db.exec(
            `INSERT INTO scripts (id, project_id, name, path, draft_version, draft_document, created_at, updated_at)
             VALUES ('s1', 'p1', 'S', '/s1.json', 0, '${validJson}', 't', 't')`,
          ),
        /CHECK/i,
      );
      assert.throws(
        () =>
          db.exec(
            `INSERT INTO scripts (id, project_id, name, path, draft_version, draft_document, created_at, updated_at)
             VALUES ('s2', 'p1', 'S', '/s2.json', 1, 'not-json', 't', 't')`,
          ),
        /CHECK/i,
      );
      assert.throws(
        () =>
          db.exec(
            `INSERT INTO script_revisions (id, script_id, revision_number, draft_document, draft_version, created_at)
             VALUES ('r1', 's3', 0, '${validJson}', 1, 't')`,
          ),
        /CHECK/i,
      );
      assert.throws(
        () =>
          db.exec(
            `INSERT INTO script_revisions (id, script_id, revision_number, draft_document, draft_version, created_at)
             VALUES ('r2', 's3', 1, 'not-json', 1, 't')`,
          ),
        /CHECK/i,
      );
      assert.throws(
        () =>
          db.exec(
            `INSERT INTO script_revisions (id, script_id, revision_number, draft_document, draft_version, created_at)
             VALUES ('r3', 's3', 1, '${validJson}', 0, 't')`,
          ),
        /CHECK/i,
      );
    } finally {
      db.close();
    }
  });

  test("transactions are exception-safe and roll back partial writes", () => {
    const db = new PersistenceDatabase(":memory:");
    try {
      assert.throws(
        () =>
          db.execTransaction(() => {
            db.exec(
              "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p1', 'X', 't', 't')",
            );
            throw new Error("boom");
          }),
        /boom/,
      );
      const count = db.prepare("SELECT COUNT(*) AS n FROM projects").get() as {
        n: number;
      };
      assert.equal(Number(count.n), 0);

      const { store } = makeFixture(db);
      assert.doesNotThrow(() => db.execTransaction(() => 42));
      void store;
    } finally {
      db.close();
    }
  });
});

describe("project contracts", () => {
  test("flow documents enforce strict JSON-safe node and edge structures", () => {
    assert.equal(
      FlowDocumentSchema.safeParse({
        schemaVersion: 1,
        nodes: [
          {
            id: "n1",
            type: "delay",
            position: { x: 0, y: 0 },
            data: { kind: "delay", payload: 1n },
          },
        ],
        edges: [],
      }).success,
      false,
      "BigInt payloads are not JSON-safe",
    );
    assert.equal(
      FlowDocumentSchema.safeParse({
        schemaVersion: 1,
        nodes: [
          {
            id: "n1",
            type: "delay",
            position: { x: 0, y: 0 },
            data: { kind: "delay", payload: { nested: [1n] } },
          },
        ],
        edges: [],
      }).success,
      false,
      "BigInt nested in a payload is rejected",
    );
    assert.equal(
      FlowDocumentSchema.safeParse({
        schemaVersion: 1,
        nodes: [
          {
            id: "n1",
            type: "delay",
            position: { x: 0, y: 0 },
            data: { kind: "delay", at: new Date() },
          },
        ],
        edges: [],
      }).success,
      false,
      "Date payloads are rejected",
    );
    assert.equal(
      FlowDocumentSchema.safeParse({
        schemaVersion: 1,
        nodes: [
          {
            id: "n1",
            type: "delay",
            position: { x: 0, y: 0 },
            data: { kind: "delay", payload: Infinity },
          },
        ],
        edges: [],
      }).success,
      false,
      "non-finite numbers are rejected",
    );
    assert.equal(
      FlowDocumentSchema.safeParse({
        schemaVersion: 1,
        nodes: [],
        edges: [{ id: "e1", source: "n1", target: "n2", payload: 1n }],
      }).success,
      false,
      "BigInt edge payloads are rejected",
    );

    const valid = FlowDocumentSchema.safeParse({
      schemaVersion: 1,
      nodes: [
        {
          id: "n1",
          type: "delay",
          position: { x: 0, y: 0 },
          data: {
            kind: "delay",
            payload: { deep: [1, -2.5, "x", true, null, { ok: false }] },
          },
        },
      ],
      edges: [],
      viewport: { x: 0, y: 12.5, zoom: 1 },
    });
    assert.equal(valid.success, true);
    if (valid.success) {
      assert.deepEqual(valid.data.nodes[0].data.payload, {
        deep: [1, -2.5, "x", true, null, { ok: false }],
      });
    }
  });

  test("script paths must be canonical absolute POSIX-like paths", () => {
    const validPaths = ["/flows/main.json", "/a/b/c.json", "/single.json"];
    for (const path of validPaths) {
      const result = CreateScriptInputSchema.safeParse({
        projectId: "p1",
        name: "Flow",
        path,
      });
      assert.equal(result.success, true, `expected "${path}" to be valid`);
    }

    const invalidPaths = [
      "flows/main.json",
      "/",
      "/flows/",
      "\\flows\\main.json",
      "/flows//main.json",
      "/flows/./main.json",
      "/flows/../main.json",
      "",
    ];
    for (const path of invalidPaths) {
      const result = CreateScriptInputSchema.safeParse({
        projectId: "p1",
        name: "Flow",
        path,
      });
      assert.equal(result.success, false, `expected "${path}" to be invalid`);
    }
  });

  test("restore revision input requires an expected draft version", () => {
    assert.equal(
      RestoreRevisionInputSchema.safeParse({
        scriptId: "s1",
        revisionId: "r1",
      }).success,
      false,
    );
    assert.equal(
      RestoreRevisionInputSchema.safeParse({
        scriptId: "s1",
        revisionId: "r1",
        expectedDraftVersion: 3,
      }).success,
      true,
    );
    assert.equal(
      RestoreRevisionInputSchema.safeParse({
        scriptId: "s1",
        revisionId: "r1",
        expectedDraftVersion: 0,
      }).success,
      false,
    );
    assert.equal(
      RestoreRevisionInputSchema.safeParse({
        scriptId: "s1",
        revisionId: "r1",
        expectedDraftVersion: -1,
      }).success,
      false,
    );
  });

  test("revision messages are trimmed and capped at 500 characters", () => {
    const parsed = CreateRevisionInputSchema.parse({
      scriptId: "s1",
      message: "  hello world  ",
    });
    assert.equal(parsed.message, "hello world");
    assert.equal(
      CreateRevisionInputSchema.parse({ scriptId: "s1" }).message,
      undefined,
    );
    assert.equal(
      CreateRevisionInputSchema.safeParse({
        scriptId: "s1",
        message: "x".repeat(501),
      }).success,
      false,
    );
  });
});

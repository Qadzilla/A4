import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { ensureLaunchSchema } from '../db/ensure-schema';

/**
 * The canvas stores where each panel sits. These cover the two things that
 * would be silent failures: a redeploy onto a volume whose panels table
 * predates the canvas, and a panel that was never placed reading as unplaced
 * rather than as sitting at the origin.
 */

function makeDb() {
  const sqlite = new Database(':memory:');
  return sqlite;
}

/** The workspace_panels table as it stood before the canvas existed. */
function createPrePivotPanels(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE workspace_panels (
      id TEXT PRIMARY KEY,
      tax_year INTEGER NOT NULL,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT,
      payload TEXT NOT NULL,
      payload_version INTEGER NOT NULL DEFAULT 1,
      position REAL NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

function columnsOf(sqlite: Database.Database, table: string): Set<string> {
  return new Set(
    (sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
      (c) => c.name,
    ),
  );
}

describe('canvas columns', () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = makeDb();
  });

  it('adds x, y and w to a panels table that predates the canvas', () => {
    createPrePivotPanels(sqlite);
    expect(columnsOf(sqlite, 'workspace_panels').has('x')).toBe(false);

    ensureLaunchSchema(sqlite);

    const cols = columnsOf(sqlite, 'workspace_panels');
    expect(cols.has('x')).toBe(true);
    expect(cols.has('y')).toBe(true);
    expect(cols.has('w')).toBe(true);
  });

  it('leaves existing panels unplaced rather than stacking them at the origin', () => {
    createPrePivotPanels(sqlite);
    sqlite
      .prepare(
        `INSERT INTO workspace_panels
         (id, tax_year, workspace_id, user_id, kind, title, payload, created_at, updated_at)
         VALUES ('p1', 2026, 'w1', 'u1', 'generated', 'Answer', '{}', 0, 0)`,
      )
      .run();

    ensureLaunchSchema(sqlite);

    const row = sqlite.prepare('SELECT x, y, w FROM workspace_panels WHERE id = ?').get('p1') as {
      x: number | null;
      y: number | null;
      w: number | null;
    };
    // Null is the signal the canvas packs on. A zero here would pile every
    // pre-canvas panel on top of itself in the corner.
    expect(row.x).toBeNull();
    expect(row.y).toBeNull();
    expect(row.w).toBeNull();
  });

  it('runs twice without error', () => {
    createPrePivotPanels(sqlite);
    ensureLaunchSchema(sqlite);
    expect(() => ensureLaunchSchema(sqlite)).not.toThrow();
    expect(columnsOf(sqlite, 'workspace_panels').has('x')).toBe(true);
  });
});

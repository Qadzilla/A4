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

/**
 * Placement used to go through a narrow UPDATE, which raced the write that
 * creates the panel: the canvas places a panel a frame or two after it
 * arrives, and an update that got there first matched no rows and vanished.
 * The panel then sat in the right place on screen and nowhere in the
 * database — the failure looked like success until a reload.
 *
 * These assert the property that makes that impossible: writing a placement
 * has to work whether or not the row is already there, and must never be the
 * thing that moves a panel the user positioned.
 */
describe('placing a panel', () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = makeDb();
    createPrePivotPanels(sqlite);
    ensureLaunchSchema(sqlite);
  });

  /** The shape of the upsert the router runs, reduced to the layout columns. */
  function upsert(id: string, place?: { x: number; y: number; w: number }) {
    const existing = sqlite.prepare('SELECT id FROM workspace_panels WHERE id = ?').get(id);
    if (existing) {
      if (!place) return;
      sqlite
        .prepare('UPDATE workspace_panels SET x = ?, y = ?, w = ? WHERE id = ?')
        .run(place.x, place.y, place.w, id);
      return;
    }
    sqlite
      .prepare(
        `INSERT INTO workspace_panels
         (id, tax_year, workspace_id, user_id, kind, title, payload, x, y, w, created_at, updated_at)
         VALUES (?, 2026, 'w1', 'u1', 'generated', 'Answer', '{}', ?, ?, ?, 0, 0)`,
      )
      .run(id, place?.x ?? null, place?.y ?? null, place?.w ?? null);
  }

  const layoutOf = (id: string) =>
    sqlite.prepare('SELECT x, y, w FROM workspace_panels WHERE id = ?').get(id) as {
      x: number | null;
      y: number | null;
      w: number | null;
    };

  it('records a placement that arrives before the panel itself', () => {
    upsert('p1', { x: 32, y: 32, w: 440 });
    expect(layoutOf('p1')).toEqual({ x: 32, y: 32, w: 440 });
  });

  it('records a placement that arrives after the panel', () => {
    upsert('p1');
    upsert('p1', { x: 500, y: 60, w: 760 });
    expect(layoutOf('p1')).toEqual({ x: 500, y: 60, w: 760 });
  });

  it('leaves a placed panel where it is when a tool reruns', () => {
    upsert('p1', { x: 500, y: 60, w: 760 });
    // A rerun carries no coordinates, so it must not disturb them.
    upsert('p1');
    expect(layoutOf('p1')).toEqual({ x: 500, y: 60, w: 760 });
  });
});

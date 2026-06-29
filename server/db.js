/**
 * db.js — local SQLite cache for scan results.
 *
 * Keeps the "zero external dependency" promise by using Node's built-in
 * `node:sqlite` (Node 22.5+). The cache lets the UI open instantly without
 * re-walking the filesystem on every page load: scanning is now an explicit
 * user action, and its result — plus the time it ran — lives here.
 *
 * Stored under ~/.agent-memory-inspector/cache.db. Reading your memory files
 * is still local-only; this just remembers what the last scan found.
 */

import './quiet-sqlite.js'; // install the warning filter at module-eval time
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DIR = join(homedir(), '.agent-memory-inspector');
const DB_PATH = join(DIR, 'cache.db');
const LAST_SCAN_KEY = 'last_scan_time';

// How many pre-edit versions to retain per memory (rolling window).
const HISTORY_LIMIT = 3;

let _db = null;

/**
 * Open (and lazily initialize) the cache database.
 *
 * `node:sqlite` is imported dynamically — and only here — so it loads after
 * quiet-sqlite.js has installed the warning filter. A static import would be
 * instantiated during ESM linking, before any module body runs, and the
 * experimental warning would slip through.
 */
async function db() {
  if (_db) return _db;
  const { DatabaseSync } = await import('node:sqlite');
  mkdirSync(DIR, { recursive: true });
  _db = new DatabaseSync(DB_PATH);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id          TEXT PRIMARY KEY,
      kind        TEXT,
      kindLabel   TEXT,
      path        TEXT,
      name        TEXT,
      description TEXT,
      type        TEXT,
      product     TEXT,
      scope       TEXT,
      links       TEXT,
      size        INTEGER,
      mtime       REAL,
      isIndex     INTEGER
    );
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
    -- Rolling edit history: the last few pre-edit snapshots of each memory.
    CREATE TABLE IF NOT EXISTS history (
      id        TEXT,
      content   TEXT,
      savedAt   REAL
    );
    CREATE INDEX IF NOT EXISTS idx_history_id ON history (id, savedAt);
    -- Deleted memories are archived here (full content + metadata) instead of
    -- being lost — recoverable, and the active cache stays clean.
    CREATE TABLE IF NOT EXISTS archive (
      id          TEXT,
      path        TEXT,
      name        TEXT,
      type        TEXT,
      product     TEXT,
      scope       TEXT,
      content     TEXT,
      archivedAt  REAL
    );
  `);
  return _db;
}

function rowToRecord(r) {
  return {
    id: r.id,
    kind: r.kind,
    kindLabel: r.kindLabel,
    path: r.path,
    name: r.name,
    description: r.description,
    type: r.type,
    product: r.product,
    scope: r.scope,
    links: JSON.parse(r.links || '[]'),
    size: r.size,
    mtime: r.mtime,
    isIndex: Boolean(r.isIndex),
  };
}

const INSERT_SQL = `
  INSERT OR REPLACE INTO memories
    (id, kind, kindLabel, path, name, description, type, product, scope, links, size, mtime, isIndex)
  VALUES
    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

function bindRecord(stmt, m) {
  stmt.run(
    m.id, m.kind, m.kindLabel, m.path, m.name, m.description,
    m.type, m.product, m.scope, JSON.stringify(m.links || []),
    m.size, m.mtime, m.isIndex ? 1 : 0,
  );
}

/** Replace the whole cache with a fresh scan and stamp the scan time. */
export async function saveScan(memories, scanTime = Date.now()) {
  const d = await db();
  d.exec('BEGIN');
  try {
    d.exec('DELETE FROM memories');
    const stmt = d.prepare(INSERT_SQL);
    for (const m of memories) bindRecord(stmt, m);
    d.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
      .run(LAST_SCAN_KEY, String(scanTime));
    d.exec('COMMIT');
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
  return scanTime;
}

/** Read cached memories (most-recent first) and the last scan time. */
export async function readScan() {
  const d = await db();
  const rows = d.prepare('SELECT * FROM memories ORDER BY mtime DESC').all();
  const row = d.prepare('SELECT value FROM meta WHERE key = ?').get(LAST_SCAN_KEY);
  const lastScan = row ? Number(row.value) : null;
  return { memories: rows.map(rowToRecord), lastScan };
}

/** Insert or update a single cached record (after an in-place edit). */
export async function upsertMemory(record) {
  if (!record) return;
  bindRecord((await db()).prepare(INSERT_SQL), record);
}

/** Drop a single record from the cache (after a delete). Also clears its history. */
export async function removeMemory(id) {
  const d = await db();
  d.prepare('DELETE FROM memories WHERE id = ?').run(id);
  d.prepare('DELETE FROM history WHERE id = ?').run(id);
}

/**
 * Record a pre-edit snapshot, keeping only the newest HISTORY_LIMIT versions
 * per memory. Older snapshots are pruned in the same transaction.
 */
export async function pushHistory(id, content, savedAt = Date.now()) {
  const d = await db();
  d.exec('BEGIN');
  try {
    d.prepare('INSERT INTO history (id, content, savedAt) VALUES (?, ?, ?)')
      .run(id, content, savedAt);
    d.prepare(`
      DELETE FROM history
       WHERE id = ?
         AND rowid NOT IN (
           SELECT rowid FROM history WHERE id = ? ORDER BY savedAt DESC LIMIT ?
         )
    `).run(id, id, HISTORY_LIMIT);
    d.exec('COMMIT');
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

/** A memory's edit history, newest first. */
export async function listHistory(id) {
  const d = await db();
  return d.prepare('SELECT content, savedAt FROM history WHERE id = ? ORDER BY savedAt DESC')
    .all(id)
    .map((r) => ({ content: r.content, savedAt: Number(r.savedAt) }));
}

/** Archive a deleted memory's full content + metadata so it's recoverable. */
export async function archiveMemory(record, content, archivedAt = Date.now()) {
  const d = await db();
  d.prepare(`
    INSERT INTO archive (id, path, name, type, product, scope, content, archivedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id, record.path, record.name || '', record.type || '',
    record.product || '', record.scope || '', content, archivedAt,
  );
}

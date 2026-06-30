/**
 * sources.js — discovers and parses agent "memory" already on disk.
 *
 * Design principle: we do NOT introduce a new memory store. We READ what your
 * coding agents already wrote — Claude Code's MEMORY.md + per-fact memory files,
 * CLAUDE.md project briefs, AGENTS.md, Cursor rules, etc. Zero migration.
 *
 * Everything here uses only Node built-ins so `npx agent-memory-inspector`
 * works on any machine with no install step.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename, relative, sep } from 'node:path';

/**
 * A memory "source kind" describes one convention we know how to read.
 * `roots` are directories we walk; `match` decides whether a file qualifies.
 */
const KINDS = [
  {
    id: 'claude-memory',
    label: 'Claude Code memory',
    // ~/.claude/projects/<slug>/memory/*.md  +  MEMORY.md index
    roots: [join(homedir(), '.claude', 'projects')],
    match: (p) => p.includes(`${sep}memory${sep}`) && p.endsWith('.md'),
  },
  {
    id: 'claude-md',
    label: 'CLAUDE.md brief',
    roots: [process.cwd(), homedir()],
    match: (p) => basename(p).toLowerCase() === 'claude.md',
  },
  {
    id: 'agents-md',
    label: 'AGENTS.md',
    roots: [process.cwd()],
    match: (p) => basename(p).toLowerCase() === 'agents.md',
  },
  {
    id: 'cursor-rules',
    label: 'Cursor rules',
    roots: [join(process.cwd(), '.cursor', 'rules')],
    match: (p) => p.endsWith('.mdc') || p.endsWith('.md'),
  },
];

// L1 classification — the product/agent a memory belongs to, keyed by source kind.
const PRODUCT_BY_KIND = {
  'claude-memory': 'claude-code',
  'claude-md': 'claude-code',
  'agents-md': 'codex',
  'cursor-rules': 'cursor',
};

/** L1: which product/agent this memory belongs to. */
function productFor(kind) {
  return PRODUCT_BY_KIND[kind] || 'other';
}

/**
 * L2: how broadly the memory applies — 'project', 'user', or 'global'.
 * Explicit frontmatter scope/type wins; otherwise we infer from the path:
 * per-project trees → project, anything under $HOME → user, else global.
 */
function scopeFor(path, meta, kind) {
  const declared = meta.metadata?.scope || meta.scope || meta.metadata?.type || meta.type;
  if (declared === 'project' || declared === 'user') return declared;
  if (kind === 'claude-memory') {
    return path.includes(`${sep}projects${sep}`) ? 'project' : 'user';
  }
  if (path.startsWith(process.cwd())) return 'project';
  if (path.startsWith(homedir())) return 'user';
  return 'global';
}

// Directories we never descend into — keeps scans fast and avoids noise.
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.cache',
  'shell-snapshots', 'file-history', 'backups', 'sessions',
]);

const MAX_DEPTH = 6;

async function walk(dir, depth, out) {
  if (depth > MAX_DEPTH || !existsSync(dir)) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // unreadable dir (perms) — skip silently
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      await walk(full, depth + 1, out);
    } else if (e.isFile()) {
      out.push(full);
    }
  }
}

/** Parse simple YAML-ish frontmatter (the subset agent memory files use). */
export function parseFrontmatter(text) {
  if (!text.startsWith('---')) return { meta: {}, body: text };
  const end = text.indexOf('\n---', 3);
  if (end === -1) return { meta: {}, body: text };
  const raw = text.slice(3, end).trim();
  const body = text.slice(end + 4).replace(/^\n/, '');
  const meta = {};
  let currentKey = null;
  for (const line of raw.split('\n')) {
    const indented = /^\s+/.test(line);
    const m = line.match(/^\s*([\w.-]+):\s*(.*)$/);
    if (m) {
      const [, key, val] = m;
      if (indented && currentKey) {
        meta[currentKey] = meta[currentKey] || {};
        meta[currentKey][key] = stripQuotes(val);
      } else {
        currentKey = key;
        if (val === '') meta[key] = {};
        else meta[key] = stripQuotes(val);
      }
    }
  }
  return { meta, body: body.trim() };
}

function stripQuotes(s) {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/** Extract [[wikilinks]] used to cross-link memories. */
export function extractLinks(body) {
  const links = new Set();
  const re = /\[\[([^\]]+)\]\]/g;
  let m;
  while ((m = re.exec(body))) links.add(m[1].trim());
  return [...links];
}

/** Build a stable id from a file path (used in URLs and the graph). */
export function idFor(path) {
  return Buffer.from(path).toString('base64url');
}
export function pathFor(id) {
  return Buffer.from(id, 'base64url').toString('utf8');
}

/** Find the source kind that claims this path, if any. */
function kindForPath(path) {
  return KINDS.find((k) => k.match(path)) || null;
}

/**
 * Build a single memory record from a file path. Returns null if the path
 * isn't a known memory file or can't be stat'd. Used both by the full scan
 * and to refresh one row after an in-place edit.
 */
export async function recordForPath(path, kind = kindForPath(path)) {
  if (!kind) return null;
  let st;
  try {
    st = await stat(path);
  } catch {
    return null;
  }
  let meta = {};
  let links = [];
  let preview = '';
  // Only parse small files eagerly; the detail view reads full content.
  if (st.size < 64 * 1024) {
    try {
      const text = await readFile(path, 'utf8');
      const parsed = parseFrontmatter(text);
      meta = parsed.meta;
      links = extractLinks(parsed.body);
      preview = parsed.body.slice(0, 200);
    } catch {
      /* unreadable — keep the stub */
    }
  }
  return {
    id: idFor(path),
    kind: kind.id,
    kindLabel: kind.label,
    path,
    name: meta.name || basename(path).replace(/\.(md|mdc)$/, ''),
    description: meta.description || preview.split('\n')[0] || '',
    type: meta.metadata?.type || meta.type || kind.id,
    product: productFor(kind.id),          // L1 — by product
    scope: scopeFor(path, meta, kind.id),  // L2 — by coverage scope
    links,
    size: st.size,
    mtime: st.mtimeMs,
    isIndex: basename(path).toLowerCase() === 'memory.md',
  };
}

/**
 * Scan all known sources and return a flat list of memory records.
 * Each record is light — body is loaded lazily by the detail endpoint.
 *
 * `onProgress` (optional) fires once per discovered memory as it's parsed,
 * letting a streaming caller surface the live path + content preview.
 */
export async function scanMemories(onProgress) {
  const records = [];
  const seen = new Set();

  for (const kind of KINDS) {
    for (const root of kind.roots) {
      const files = [];
      await walk(root, 0, files);
      for (const path of files) {
        if (!kind.match(path) || seen.has(path)) continue;
        seen.add(path);
        const record = await recordForPath(path, kind);
        if (record) {
          records.push(record);
          onProgress?.({
            path: record.path,
            rel: safeRel(record.path),
            name: record.name,
            description: record.description,
            kindLabel: record.kindLabel,
            count: records.length,
          });
        }
      }
    }
  }

  records.sort((a, b) => b.mtime - a.mtime);
  return records;
}

/** Load one memory's full parsed content for the detail / edit view. */
export async function loadMemory(id) {
  const path = pathFor(id);
  const text = await readFile(path, 'utf8');
  const { meta, body } = parseFrontmatter(text);
  return {
    id,
    path,
    relPath: safeRel(path),
    meta,
    body,
    links: extractLinks(body),
    raw: text,
  };
}

function safeRel(path) {
  try {
    const r = relative(homedir(), path);
    return r.startsWith('..') ? path : `~${sep}${r}`;
  } catch {
    return path;
  }
}

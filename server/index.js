#!/usr/bin/env node
/**
 * server/index.js — zero-dependency local API + static host.
 *
 * Local-first by design: binds to 127.0.0.1 only, never makes outbound
 * network calls, and reads/writes only files you already have. No telemetry.
 */
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { scanMemories, loadMemory, pathFor } from './sources.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = join(__dirname, '..', 'web', 'dist');
const PORT = Number(process.env.PORT) || 4317;
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(data);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

const routes = {
  // List every memory found across all known agent sources.
  'GET /api/memories': async (_req, res) => {
    const memories = await scanMemories();
    const stats = summarize(memories);
    json(res, 200, { memories, stats });
  },

  // Full content of one memory (frontmatter + body + raw).
  'GET /api/memory': async (req, res, url) => {
    const id = url.searchParams.get('id');
    if (!id) return json(res, 400, { error: 'missing id' });
    try {
      const mem = await loadMemory(id);
      json(res, 200, mem);
    } catch (e) {
      json(res, 404, { error: String(e.message || e) });
    }
  },

  // Save an edited memory back to its original file (with a .bak safety copy).
  'POST /api/memory': async (req, res) => {
    const { id, content } = await readBody(req);
    if (!id || typeof content !== 'string') {
      return json(res, 400, { error: 'id and content required' });
    }
    const path = pathFor(id);
    if (!existsSync(path)) return json(res, 404, { error: 'file not found' });
    try {
      const prev = await readFile(path, 'utf8');
      await writeFile(`${path}.bak`, prev, 'utf8'); // reversible by design
      await writeFile(path, content, 'utf8');
      json(res, 200, { ok: true, backup: `${path}.bak` });
    } catch (e) {
      json(res, 500, { error: String(e.message || e) });
    }
  },

  // Link graph: nodes = memories, edges = [[wikilinks]] between them.
  'GET /api/graph': async (_req, res) => {
    const memories = await scanMemories();
    const byName = new Map(memories.map((m) => [m.name, m.id]));
    const nodes = memories.map((m) => ({
      id: m.id, name: m.name, type: m.type, kind: m.kind,
    }));
    const edges = [];
    for (const m of memories) {
      for (const l of m.links) {
        const target = byName.get(l);
        if (target) edges.push({ source: m.id, target });
      }
    }
    json(res, 200, { nodes, edges });
  },
};

function summarize(memories) {
  const byType = {};
  const byKind = {};
  let linked = 0;
  for (const m of memories) {
    byType[m.type] = (byType[m.type] || 0) + 1;
    byKind[m.kind] = (byKind[m.kind] || 0) + 1;
    if (m.links.length) linked++;
  }
  return { total: memories.length, byType, byKind, linked };
}

async function serveStatic(req, res, url) {
  let pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  let file = join(WEB_DIR, pathname);
  if (!existsSync(file)) {
    // SPA fallback if a build exists; otherwise a friendly dev message.
    file = join(WEB_DIR, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(devPlaceholder());
    }
  }
  try {
    const buf = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}

function devPlaceholder() {
  return `<!doctype html><meta charset=utf8><title>Agent Memory Inspector</title>
  <body style="font:16px system-ui;max-width:40rem;margin:4rem auto;padding:0 1rem;color:#e2e8f0;background:#0f172a">
  <h1>🧠 Agent Memory Inspector</h1>
  <p>The API is running. The web UI hasn't been built yet.</p>
  <p>Run <code style="background:#1e293b;padding:.2em .4em;border-radius:4px">npm run dev</code> in <code>web/</code> for the live UI,
  or <code style="background:#1e293b;padding:.2em .4em;border-radius:4px">npm run build</code> to bundle it.</p>
  <p>API check: <a style="color:#38bdf8" href="/api/memories">/api/memories</a></p>
  </body>`;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const key = `${req.method} ${url.pathname}`;
  const handler = routes[key];
  try {
    if (handler) await handler(req, res, url);
    else await serveStatic(req, res, url);
  } catch (e) {
    json(res, 500, { error: String(e?.message || e) });
  }
});

server.listen(PORT, HOST, () => {
  const link = `http://${HOST}:${PORT}`;
  console.log(`\n  🧠 Agent Memory Inspector`);
  console.log(`  Local-first · no telemetry · reading your existing agent memory\n`);
  console.log(`  ▸ ${link}\n`);
  openBrowser(link);
});

/** Best-effort cross-platform browser open. Never throws. */
function openBrowser(link) {
  if (process.env.NO_OPEN) return;
  import('node:child_process').then(({ spawn }) => {
    const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', link] : [link];
    try {
      spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
    } catch {
      /* headless / no browser — fine */
    }
  });
}

import { useEffect, useMemo, useState } from 'react';
import { useI18n } from './i18n.jsx';

const API = '';

// Color mapping per memory type. The human label comes from i18n (`type.<id>`).
const TYPE_STYLE = {
  user:     { dot: 'bg-emerald-400', text: 'text-emerald-300' },
  feedback: { dot: 'bg-amber-400',   text: 'text-amber-300' },
  project:  { dot: 'bg-sky-400',     text: 'text-sky-300' },
  reference:{ dot: 'bg-violet-400',  text: 'text-violet-300' },
};
const FALLBACK_STYLE = { dot: 'bg-slate-500', text: 'text-slate-400' };
const styleFor = (t) => TYPE_STYLE[t] || FALLBACK_STYLE;
// Localized label for a type id; falls back to the raw id for unknown types.
const typeLabel = (t, tr) => {
  const known = ['user', 'feedback', 'project', 'reference'];
  return known.includes(t) ? tr(`type.${t}`) : (t || tr('type.other'));
};

function useMemories() {
  const [data, setData] = useState({ memories: [], stats: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch with bounded retry — on first load the browser tab can race ahead
  // of the local server (or the server may be restarting). Never leave the
  // user staring at an empty list because of a single transient failure.
  const reload = (attempt = 0) => {
    setLoading(true);
    fetch(`${API}/api/memories`, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => { setData(d); setError(null); setLoading(false); })
      .catch((e) => {
        if (attempt < 5) {
          setTimeout(() => reload(attempt + 1), 400 * (attempt + 1));
        } else {
          setError(String(e.message || e));
          setLoading(false);
        }
      });
  };
  useEffect(() => reload(0), []);
  return { ...data, loading, error, reload: () => reload(0) };
}

export default function App() {
  const { memories, stats, loading, error, reload } = useMemories();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return memories.filter((m) => {
      if (typeFilter && m.type !== typeFilter) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.path.toLowerCase().includes(q)
      );
    });
  }, [memories, query, typeFilter]);

  return (
    <div className="h-screen flex flex-col">
      <Header stats={stats} onReload={reload} loading={loading} />
      <div className="flex-1 flex min-h-0">
        <Sidebar
          memories={filtered}
          total={memories.length}
          query={query}
          setQuery={setQuery}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          stats={stats}
          selectedId={selectedId}
          onSelect={setSelectedId}
          loading={loading}
          error={error}
        />
        <Detail id={selectedId} onSaved={reload} />
      </div>
    </div>
  );
}

function Header({ stats, onReload, loading }) {
  const { t, toggle } = useI18n();
  return (
    <header className="flex items-center gap-3 px-5 h-14 border-b border-edge bg-panel/80 backdrop-blur">
      <span className="text-xl">🧠</span>
      <div className="leading-tight">
        <div className="font-semibold tracking-tight">{t('app.title')}</div>
        <div className="text-[11px] text-slate-500 -mt-0.5">
          {t('app.subtitle')}
        </div>
      </div>
      <div className="flex-1" />
      {stats && (
        <div className="hidden md:flex items-center gap-4 text-xs text-slate-400">
          <Stat n={stats.total} label={t('stats.memories')} />
          <Stat n={stats.linked} label={t('stats.linked')} />
          <Stat n={Object.keys(stats.byKind || {}).length} label={t('stats.sources')} />
        </div>
      )}
      <button
        onClick={toggle}
        className="ml-2 text-xs px-3 py-1.5 rounded-md border border-edge hover:bg-edge transition-colors"
        title="Switch language / 切换语言"
      >
        🌐 {t('lang.switch')}
      </button>
      <button
        onClick={onReload}
        className="text-xs px-3 py-1.5 rounded-md border border-edge hover:bg-edge transition-colors"
      >
        {loading ? t('header.scanning') : t('header.rescan')}
      </button>
    </header>
  );
}

function Stat({ n, label }) {
  return (
    <div className="text-center">
      <div className="text-slate-100 font-semibold tabular-nums">{n}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function Sidebar({ memories, total, query, setQuery, typeFilter, setTypeFilter, stats, selectedId, onSelect, loading, error }) {
  const { t } = useI18n();
  const types = stats ? Object.entries(stats.byType || {}).sort((a, b) => b[1] - a[1]) : [];
  return (
    <aside className="w-[22rem] shrink-0 border-r border-edge bg-panel/40 flex flex-col min-h-0">
      <div className="p-3 border-b border-edge space-y-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('sidebar.search')}
          className="w-full bg-ink border border-edge rounded-md px-3 py-2 text-sm outline-none focus:border-sky-500/60 transition-colors"
        />
        <div className="flex flex-wrap gap-1.5">
          <Chip active={!typeFilter} onClick={() => setTypeFilter(null)} label={t('sidebar.all', { n: total })} />
          {types.map(([ty, n]) => (
            <Chip
              key={ty}
              active={typeFilter === ty}
              onClick={() => setTypeFilter(typeFilter === ty ? null : ty)}
              label={`${typeLabel(ty, t)} ${n}`}
              dot={styleFor(ty).dot}
            />
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {error && <div className="p-4 text-sm text-rose-400">{t('detail.error', { msg: error })}</div>}
        {loading && memories.length === 0 && !error && (
          <div className="p-6 text-sm text-slate-500 text-center">{t('sidebar.scanning')}</div>
        )}
        {!error && !loading && memories.length === 0 && (
          <div className="p-6 text-sm text-slate-500 text-center">
            {t('sidebar.empty')}
          </div>
        )}
        {memories.map((m) => (
          <MemoryRow key={m.id} m={m} active={m.id === selectedId} onClick={() => onSelect(m.id)} />
        ))}
      </div>
    </aside>
  );
}

function Chip({ active, onClick, label, dot }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border transition-colors ${
        active ? 'border-sky-500/60 bg-sky-500/10 text-sky-200' : 'border-edge text-slate-400 hover:border-slate-600'
      }`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
      {label}
    </button>
  );
}

function MemoryRow({ m, active, onClick }) {
  const { t } = useI18n();
  const s = styleFor(m.type);
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 border-b border-edge/60 fade-up transition-colors ${
        active ? 'bg-sky-500/10' : 'hover:bg-edge/40'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
        <span className="font-medium text-sm text-slate-100 truncate">{m.name}</span>
        {m.isIndex && <span className="text-[9px] px-1 rounded bg-edge text-slate-400">{t('row.index')}</span>}
        <span className="flex-1" />
        {m.links.length > 0 && (
          <span className="text-[10px] text-slate-500">🔗 {m.links.length}</span>
        )}
      </div>
      {m.description && (
        <div className="text-xs text-slate-500 mt-0.5 line-clamp-2 pl-3.5">{m.description}</div>
      )}
      <div className="text-[10px] text-slate-600 mt-1 pl-3.5 truncate">{m.kindLabel}</div>
    </button>
  );
}

function Detail({ id, onSaved }) {
  const { t } = useI18n();
  const [mem, setMem] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(null);

  useEffect(() => {
    setEditing(false);
    setSavedMsg(null);
    if (!id) { setMem(null); return; }
    fetch(`${API}/api/memory?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((d) => { setMem(d); setDraft(d.raw); })
      .catch(() => setMem(null));
  }, [id]);

  if (!id) return <Empty />;
  if (!mem) return <div className="flex-1 grid place-items-center text-slate-500">{t('detail.loading')}</div>;

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/memory`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, content: draft }),
      }).then((r) => r.json());
      if (res.ok) {
        setSavedMsg(t('detail.saved'));
        setEditing(false);
        onSaved?.();
        const d = await fetch(`${API}/api/memory?id=${encodeURIComponent(id)}`).then((r) => r.json());
        setMem(d); setDraft(d.raw);
      } else {
        setSavedMsg(t('detail.error', { msg: res.error }));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-3 px-5 h-12 border-b border-edge">
        <span className={`w-2 h-2 rounded-full ${styleFor(mem.meta?.metadata?.type || mem.meta?.type).dot}`} />
        <h2 className="font-semibold truncate">{mem.meta?.name || mem.relPath}</h2>
        <span className="flex-1" />
        {savedMsg && <span className="text-xs text-emerald-400">{savedMsg}</span>}
        {!editing ? (
          <button onClick={() => setEditing(true)} className="text-xs px-3 py-1.5 rounded-md border border-edge hover:bg-edge">
            {t('detail.edit')}
          </button>
        ) : (
          <>
            <button onClick={() => { setEditing(false); setDraft(mem.raw); }} className="text-xs px-3 py-1.5 rounded-md border border-edge hover:bg-edge">
              {t('detail.cancel')}
            </button>
            <button onClick={save} disabled={saving} className="text-xs px-3 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50">
              {saving ? t('detail.saving') : t('detail.save')}
            </button>
          </>
        )}
      </div>

      <div className="px-5 py-2 border-b border-edge/60 text-[11px] text-slate-500 font-mono truncate">
        {mem.relPath}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            className="w-full h-full min-h-[60vh] bg-ink border border-edge rounded-lg p-4 font-mono text-sm leading-relaxed outline-none focus:border-sky-500/60 resize-none"
          />
        ) : (
          <Rendered mem={mem} />
        )}
      </div>
    </main>
  );
}

function Rendered({ mem }) {
  const { t } = useI18n();
  const meta = mem.meta || {};
  return (
    <div className="max-w-3xl fade-up">
      {Object.keys(meta).length > 0 && (
        <div className="mb-5 rounded-lg border border-edge bg-panel/60 p-4 text-sm">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">{t('detail.frontmatter')}</div>
          <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5">
            {flattenMeta(meta).map(([k, v]) => (
              <FrontmatterRow key={k} k={k} v={v} />
            ))}
          </dl>
        </div>
      )}
      <article className="prose-invert text-[15px] leading-7 text-slate-200 whitespace-pre-wrap">
        {linkify(mem.body)}
      </article>
      {mem.links.length > 0 && (
        <div className="mt-6 pt-4 border-t border-edge">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">{t('detail.linksTo')}</div>
          <div className="flex flex-wrap gap-2">
            {mem.links.map((l) => (
              <span key={l} className="text-xs px-2 py-1 rounded-md bg-edge text-sky-300">[[{l}]]</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FrontmatterRow({ k, v }) {
  return (
    <>
      <dt className="text-slate-500 font-mono text-xs pt-0.5">{k}</dt>
      <dd className="text-slate-200">{v}</dd>
    </>
  );
}

function flattenMeta(meta, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(meta)) {
    if (v && typeof v === 'object') out.push(...flattenMeta(v, `${prefix}${k}.`));
    else out.push([`${prefix}${k}`, String(v)]);
  }
  return out;
}

// Render [[wikilinks]] as highlighted inline tokens.
function linkify(text) {
  const parts = String(text).split(/(\[\[[^\]]+\]\])/g);
  return parts.map((p, i) =>
    /^\[\[[^\]]+\]\]$/.test(p)
      ? <span key={i} className="text-sky-400 font-medium">{p}</span>
      : <span key={i}>{p}</span>
  );
}

function Empty() {
  const { t } = useI18n();
  return (
    <main className="flex-1 grid place-items-center text-center px-8">
      <div className="max-w-md fade-up">
        <div className="text-5xl mb-4">🧠</div>
        <h2 className="text-lg font-semibold text-slate-200">{t('empty.title')}</h2>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed">
          {t('empty.body')}
        </p>
      </div>
    </main>
  );
}

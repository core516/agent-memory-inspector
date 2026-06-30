import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from './i18n.jsx';

const API = '';

// Color mapping per memory type. The human label comes from i18n (`type.<id>`).
const TYPE_STYLE = {
  user:     { dot: 'bg-mint',   text: 'text-[#2f9c84]' },
  feedback: { dot: 'bg-orange', text: 'text-[#d97a2e]' },
  project:  { dot: 'bg-sky',    text: 'text-[#2f86c9]' },
  reference:{ dot: 'bg-purple', text: 'text-purpleDeep' },
};
const FALLBACK_STYLE = { dot: 'bg-[#C9BFD8]', text: 'text-muted' };
const styleFor = (t) => TYPE_STYLE[t] || FALLBACK_STYLE;

// Flat candy-pink brain mascot. Inline SVG (not the 🧠 emoji) so there's no
// baked-in black glyph outline — the only frame is the gradient ring around it.
function Brain({ className = '' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="brain">
      <defs>
        <linearGradient id="brainGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFC2D4" />
          <stop offset="100%" stopColor="#FF8FB0" />
        </linearGradient>
      </defs>
      <path
        fill="url(#brainGrad)"
        d="M32 9 C35 4 41 4 45 9 C49 8 54 11 54 17 C57 21 58 26 56 30 C55 35 54 38 50 40 C47 43 44 45 40 44 C37 44 35 44 32 43 C29 44 27 44 24 44 C20 45 17 43 14 40 C10 38 9 35 8 30 C6 26 7 21 10 17 C10 11 15 8 19 9 C23 4 29 4 32 9 Z"
      />
      <g fill="none" stroke="#E8729E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.6">
        <path d="M32 12 C35 18 29 24 32 30 C35 36 30 39 32 42" />
        <path d="M38 17 C44 19 44 24 39 26" />
        <path d="M42 31 C47 32 47 36 42 37" />
        <path d="M26 17 C20 19 20 24 25 26" />
        <path d="M22 31 C17 32 17 36 22 37" />
      </g>
    </svg>
  );
}

// L1 — color per product. L2 — color per coverage scope.
const PRODUCT_STYLE = {
  'claude-code': { dot: 'bg-purple' },
  codex:         { dot: 'bg-sky' },
  cursor:        { dot: 'bg-orange' },
};
const SCOPE_STYLE = {
  project: { dot: 'bg-sky' },
  user:    { dot: 'bg-mint' },
  global:  { dot: 'bg-purple' },
};
const productDot = (p) => (PRODUCT_STYLE[p] || FALLBACK_STYLE).dot;
const scopeDot = (s) => (SCOPE_STYLE[s] || FALLBACK_STYLE).dot;
// Localized label with raw-id fallback for unknown values.
const labelOr = (prefix, id, tr) => {
  const s = tr(`${prefix}.${id}`);
  return s === `${prefix}.${id}` ? id : s;
};
// Localized label for a type id; falls back to the raw id for unknown types.
const typeLabel = (t, tr) => {
  const known = ['user', 'feedback', 'project', 'reference'];
  return known.includes(t) ? tr(`type.${t}`) : (t || tr('type.other'));
};

function useMemories() {
  const [data, setData] = useState({ memories: [], stats: null, lastScan: null });
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);

  // Load cached scan results — no filesystem scan happens here, so opening
  // the page is instant. Bounded retry covers the brief window where the tab
  // races ahead of the local server (or it's restarting).
  const load = (attempt = 0) => {
    setLoading(true);
    fetch(`${API}/api/memories`, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => { setData(d); setError(null); setLoading(false); })
      .catch((e) => {
        if (attempt < 5) {
          setTimeout(() => load(attempt + 1), 400 * (attempt + 1));
        } else {
          setError(String(e.message || e));
          setLoading(false);
        }
      });
  };

  // Explicit rescan — the only action that walks the filesystem. Persists to
  // the cache server-side and returns the fresh list plus the new scan time.
  const rescan = () => {
    setScanning(true);
    fetch(`${API}/api/scan`, { method: 'POST' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(String(e.message || e)))
      .finally(() => setScanning(false));
  };

  useEffect(() => load(0), []);
  return { ...data, loading, scanning, error, reload: () => load(0), rescan };
}

export default function App() {
  const { memories, stats, lastScan, loading, scanning, error, reload, rescan } = useMemories();
  const [query, setQuery] = useState('');
  const [typeFilters, setTypeFilters] = useState([]); // multi-select
  const [productFilter, setProductFilter] = useState(null); // L1
  const [scopeFilter, setScopeFilter] = useState(null);     // L2
  const [selectedId, setSelectedId] = useState(null);

  const matchQuery = (m, q) =>
    !q ||
    m.name.toLowerCase().includes(q) ||
    m.description.toLowerCase().includes(q) ||
    m.path.toLowerCase().includes(q);
  const passType = (m) => !typeFilters.length || typeFilters.includes(m.type);
  const passProduct = (m) => !productFilter || m.product === productFilter;
  const passScope = (m) => !scopeFilter || m.scope === scopeFilter;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return memories.filter((m) => passType(m) && passProduct(m) && passScope(m) && matchQuery(m, q));
  }, [memories, query, typeFilters, productFilter, scopeFilter]);

  // Cascading facet options. Each facet counts the memories passing the OTHER
  // active filters (plus search) — so choosing a 范围 narrows what 类型 offers,
  // and vice-versa. A facet never filters itself, keeping its options visible
  // for multi-select; the currently-selected ids are always kept (even at 0)
  // so they can be toggled back off. Options that fall to 0 are hidden.
  const facets = useMemo(() => {
    const q = query.trim().toLowerCase();
    const tally = (predicate, key, keepIds) => {
      const counts = {};
      for (const id of keepIds) counts[id] = 0;
      for (const m of memories) {
        if (matchQuery(m, q) && predicate(m)) counts[m[key]] = (counts[m[key]] || 0) + 1;
      }
      return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    };
    return {
      products: tally((m) => passScope(m) && passType(m), 'product', productFilter ? [productFilter] : []),
      scopes:   tally((m) => passProduct(m) && passType(m), 'scope', scopeFilter ? [scopeFilter] : []),
      types:    tally((m) => passProduct(m) && passScope(m), 'type', typeFilters),
    };
  }, [memories, query, typeFilters, productFilter, scopeFilter]);

  const clearFilters = () => { setTypeFilters([]); setProductFilter(null); setScopeFilter(null); };

  return (
    <div className="h-screen flex flex-col">
      <Header stats={stats} onRescan={rescan} scanning={scanning} />
      <div className="flex-1 flex min-h-0">
        <Sidebar
          memories={filtered}
          total={memories.length}
          query={query}
          setQuery={setQuery}
          typeFilter={typeFilters}
          setTypeFilters={setTypeFilters}
          productFilter={productFilter}
          setProductFilter={setProductFilter}
          scopeFilter={scopeFilter}
          setScopeFilter={setScopeFilter}
          clearFilters={clearFilters}
          facets={facets}
          selectedId={selectedId}
          onSelect={setSelectedId}
          loading={loading}
          scanning={scanning}
          error={error}
          lastScan={lastScan}
          onRescan={rescan}
        />
        <Detail id={selectedId} onSaved={reload} onDeleted={() => { setSelectedId(null); reload(); }} />
      </div>
    </div>
  );
}

function Header({ stats, onRescan, scanning }) {
  const { t, toggle } = useI18n();
  return (
    <header className="flex items-center gap-3 px-5 h-16 divider-grad bg-white/70 backdrop-blur-sm">
      {/* Playful candy dots in place of window controls. */}
      <div className="flex items-center gap-2 pr-1">
        <span className="w-3 h-3 rounded-full bg-coral" />
        <span className="w-3 h-3 rounded-full bg-sun" />
        <span className="w-3 h-3 rounded-full bg-mint" />
      </div>
      <span className="brain-badge w-10 h-10 ml-1"><Brain className="w-6 h-6" /></span>
      <div className="leading-tight">
        <div className="font-display text-lg text-ink">{t('app.title')}</div>
        <div className="text-[11px] text-muted -mt-0.5">
          {t('app.subtitle')}
        </div>
      </div>
      <button
        onClick={onRescan}
        disabled={scanning}
        className="btn btn-blue text-sm px-4 py-2 ml-3 font-medium flex items-center gap-1.5"
      >
        <span className={scanning ? 'inline-block animate-spin' : ''}>🔄</span>
        {scanning ? t('header.scanning') : t('header.rescan')}
      </button>
      <div className="flex-1" />
      {stats && (
        <div className="hidden md:flex items-center gap-1 text-xs text-muted mr-1">
          <Stat n={stats.total} label={t('stats.memories')} />
          <span className="w-px h-7 bg-[#E7DAF7]" />
          <Stat n={stats.linked} label={t('stats.linked')} />
          <span className="w-px h-7 bg-[#E7DAF7]" />
          <Stat n={Object.keys(stats.byKind || {}).length} label={t('stats.sources')} />
        </div>
      )}
      <button
        onClick={toggle}
        className="btn btn-ghost ml-1 text-xs px-3 py-1.5"
        title="Switch language / 切换语言"
      >
        🌐 {t('lang.switch')}
      </button>
    </header>
  );
}

function Stat({ n, label }) {
  return (
    <div className="text-center px-2">
      <div className="text-ink font-display tabular-nums">{n}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

function Sidebar({ memories, total, query, setQuery, typeFilter, setTypeFilters, productFilter, setProductFilter, scopeFilter, setScopeFilter, clearFilters, facets, selectedId, onSelect, loading, scanning, error, lastScan, onRescan }) {
  const { t } = useI18n();
  const types = facets.types;
  const products = facets.products;
  const scopes = facets.scopes;
  const noFilter = typeFilter.length === 0 && !productFilter && !scopeFilter;
  return (
    <aside className="w-[22rem] shrink-0 border-r border-[#EFE4FB] bg-cream/40 flex flex-col min-h-0">
      <div className="p-3 space-y-2.5">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-purple pointer-events-none z-10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.5" y2="16.5" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('sidebar.search')}
            className="grad-border grad-border-hover w-full rounded-2xl pl-10 pr-3 py-2.5 text-sm text-ink placeholder:text-muted outline-none focus:shadow-soft"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Chip active={noFilter} onClick={clearFilters} label={t('sidebar.all', { n: total })} />
        </div>

        {/* L1 — by product */}
        {products.length > 0 && (
          <ChipRow label={t('sidebar.product')}>
            {products.map(([p, n]) => (
              <Chip
                key={p}
                active={productFilter === p}
                onClick={() => setProductFilter(productFilter === p ? null : p)}
                label={`${labelOr('product', p, t)} ${n}`}
                dot={productDot(p)}
              />
            ))}
          </ChipRow>
        )}

        {/* L2 — by coverage scope */}
        {scopes.length > 0 && (
          <ChipRow label={t('sidebar.scope')}>
            {scopes.map(([s, n]) => (
              <Chip
                key={s}
                active={scopeFilter === s}
                onClick={() => setScopeFilter(scopeFilter === s ? null : s)}
                label={`${labelOr('scope', s, t)} ${n}`}
                dot={scopeDot(s)}
              />
            ))}
          </ChipRow>
        )}

        {/* Type — dropdown multi-select */}
        {types.length > 0 && (
          <ChipRow label={t('sidebar.type')}>
            <MultiSelect
              placeholder={t('sidebar.typeAll')}
              options={types}
              selected={typeFilter}
              onToggle={(id) =>
                setTypeFilters(typeFilter.includes(id)
                  ? typeFilter.filter((x) => x !== id)
                  : [...typeFilter, id])
              }
              onClear={() => setTypeFilters([])}
              clearLabel={t('filter.clear')}
              labelForId={(id) => typeLabel(id, t)}
              dotForId={(id) => styleFor(id).dot}
            />
          </ChipRow>
        )}
      </div>
      <LastScanBar lastScan={lastScan} scanning={scanning} />
      <div className="flex-1 overflow-y-auto px-2.5 py-2">
        {error && <div className="p-4 text-sm text-coral">{t('detail.error', { msg: error })}</div>}
        {(scanning || loading) && memories.length === 0 && !error && (
          <div className="p-6 text-sm text-muted text-center">{t('sidebar.scanning')}</div>
        )}
        {!error && !scanning && !loading && memories.length === 0 && lastScan == null && (
          <div className="p-6 text-sm text-muted text-center space-y-3">
            <div>{t('sidebar.neverScanned')}</div>
            <button onClick={onRescan} className="btn btn-blue text-xs px-4 py-2 font-medium">
              {t('header.rescan')}
            </button>
          </div>
        )}
        {!error && !scanning && !loading && memories.length === 0 && lastScan != null && (
          <div className="p-6 text-sm text-muted text-center">
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

// Formats an epoch-ms scan time as a localized, human date-time string.
function formatScanTime(ms, lang) {
  try {
    return new Date(ms).toLocaleString(lang === 'zh' ? 'zh-CN' : undefined, {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return String(ms);
  }
}

// The "last scan" strip pinned at the top of the memory list.
function LastScanBar({ lastScan, scanning }) {
  const { t, lang } = useI18n();
  const text = scanning
    ? t('sidebar.scanning')
    : lastScan != null
      ? t('sidebar.lastScan', { time: formatScanTime(lastScan, lang) })
      : t('sidebar.neverScannedShort');
  return (
    <div className="flex items-center gap-1.5 px-3.5 py-2 border-y border-[#EFE4FB] bg-white/50 text-[11px] text-muted">
      <span className={scanning ? 'inline-block animate-spin' : ''}>🕒</span>
      <span className="truncate">{text}</span>
    </div>
  );
}

function ChipRow({ label, children }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-purple/70 font-display w-9 shrink-0">{label}</span>
      {children}
    </div>
  );
}

function Chip({ active, onClick, label, dot }) {
  return (
    <button
      onClick={onClick}
      className={`btn flex items-center gap-1.5 text-[11px] px-2.5 py-1 !rounded-full ${
        active
          ? 'grad-border-sel text-purpleDeep font-medium'
          : 'grad-border grad-border-hover text-muted'
      }`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
      {label}
    </button>
  );
}

// Dropdown multi-select used for the Type filter. `selected` is an array of ids.
function MultiSelect({ placeholder, options, selected, onToggle, onClear, clearLabel, labelForId, dotForId }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const count = selected.length;
  const summary = count === 0
    ? placeholder
    : count === 1
      ? labelForId(selected[0])
      : `${labelForId(selected[0])} +${count - 1}`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`btn flex items-center gap-1.5 text-[11px] px-2.5 py-1 !rounded-full ${
          count > 0 ? 'grad-border-sel text-purpleDeep font-medium' : 'grad-border grad-border-hover text-muted'
        }`}
      >
        {summary}
        <svg className={`w-2.5 h-2.5 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-30 mt-1.5 left-0 min-w-[11rem] grad-border rounded-2xl bg-white shadow-soft p-1.5 fade-in">
          {options.map(([id, n]) => {
            const on = selected.includes(id);
            return (
              <button
                key={id}
                onClick={() => onToggle(id)}
                className={`w-full flex items-center gap-2 text-left text-xs px-2 py-1.5 rounded-xl hover:bg-cream/70 ${on ? 'text-purpleDeep font-medium' : 'text-ink'}`}
              >
                <span className={`w-3.5 h-3.5 shrink-0 grid place-items-center rounded-[5px] border ${on ? 'bg-gradient-to-br from-sky to-purple border-transparent text-white' : 'border-[#D9CCEC]'}`}>
                  {on && <span className="text-[9px] leading-none">✓</span>}
                </span>
                <span className={`w-1.5 h-1.5 rounded-full ${dotForId(id)}`} />
                <span className="flex-1 truncate">{labelForId(id)}</span>
                <span className="text-[10px] text-muted tabular-nums">{n}</span>
              </button>
            );
          })}
          {count > 0 && (
            <button onClick={onClear} className="w-full text-center text-[11px] text-muted hover:text-purpleDeep mt-1 pt-1.5 border-t border-[#EFE4FB]">
              {clearLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MemoryRow({ m, active, onClick }) {
  const { t } = useI18n();
  const s = styleFor(m.type);
  return (
    <button
      onClick={onClick}
      className={`card pop relative w-full text-left px-3 py-2.5 rounded-2xl mb-2 ${
        active ? 'grad-border-sel' : 'grad-border grad-border-hover'
      }`}
    >
      {/* Selected check badge. */}
      {active && (
        <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-gradient-to-br from-sky to-purple text-white text-[11px] grid place-items-center shadow-soft border-2 border-white">
          ✓
        </span>
      )}
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${s.dot}`} />
        <span className="font-medium text-sm truncate text-ink">{m.name}</span>
        {m.isIndex && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-sun/30 text-[#a06a12]">{t('row.index')}</span>}
        <span className="flex-1" />
        {m.links.length > 0 && (
          <span className="text-[10px] text-purple">🔗 {m.links.length}</span>
        )}
      </div>
      {m.description && (
        <div className="text-xs mt-0.5 line-clamp-2 pl-4 text-muted">{m.description}</div>
      )}
      <div className="flex flex-wrap items-center gap-1 mt-1.5 pl-4">
        <RowTag dot={productDot(m.product)}>{labelOr('product', m.product, t)}</RowTag>
        <RowTag dot={scopeDot(m.scope)}>{labelOr('scope', m.scope, t)}</RowTag>
        <RowTag dot={styleFor(m.type).dot}>{typeLabel(m.type, t)}</RowTag>
      </div>
      <div className="text-[10px] mt-1 pl-4 truncate text-muted/80">{m.kindLabel}</div>
    </button>
  );
}

// Compact label pill shown on each memory row (product / scope / type).
function RowTag({ dot, children }) {
  return (
    <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full grad-border text-muted whitespace-nowrap">
      <span className={`w-1 h-1 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

function Detail({ id, onSaved, onDeleted }) {
  const { t } = useI18n();
  const [mem, setMem] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setEditing(false);
    setSavedMsg(null);
    setConfirmDel(false);
    if (!id) { setMem(null); return; }
    fetch(`${API}/api/memory?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((d) => { setMem(d); setDraft(d.raw); })
      .catch(() => setMem(null));
  }, [id]);

  if (!id) return <Empty />;
  if (!mem) return <div className="flex-1 grid place-items-center text-muted bg-cream">{t('detail.loading')}</div>;

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

  const del = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`${API}/api/memory?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }).then((r) => r.json());
      if (res.ok) {
        onDeleted?.();
      } else {
        setConfirmDel(false);
        setSavedMsg(t('detail.error', { msg: res.error }));
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <main className="flex-1 flex flex-col min-h-0 bg-cream">
      <div className="flex items-center gap-3 px-5 h-14 divider-grad bg-white/70 backdrop-blur-sm">
        <span className={`w-2.5 h-2.5 rounded-full ${styleFor(mem.meta?.metadata?.type || mem.meta?.type).dot}`} />
        <h2 className="font-display text-ink truncate">{mem.meta?.name || mem.relPath}</h2>
        <span className="flex-1" />
        {savedMsg && <span className="toast text-xs px-2.5 py-1 rounded-full bg-mint/30 text-[#2f9c84] font-medium">{savedMsg}</span>}
        {confirmDel ? (
          <>
            <span className="text-xs text-coral font-medium">{t('detail.confirmDelete')}</span>
            <button onClick={del} disabled={deleting} className="btn text-xs px-3 py-1.5 !bg-coral text-white font-medium">
              {deleting ? t('detail.deleting') : t('detail.confirmYes')}
            </button>
            <button onClick={() => setConfirmDel(false)} disabled={deleting} className="btn btn-ghost text-xs px-3 py-1.5">
              {t('detail.cancel')}
            </button>
          </>
        ) : !editing ? (
          <>
            <button onClick={() => setEditing(true)} className="btn btn-ghost text-xs px-3 py-1.5">
              {t('detail.edit')}
            </button>
            <button onClick={() => { setSavedMsg(null); setConfirmDel(true); }} className="btn btn-ghost text-xs px-3 py-1.5 text-coral">
              {t('detail.delete')}
            </button>
          </>
        ) : (
          <>
            <button onClick={() => { setEditing(false); setDraft(mem.raw); }} className="btn btn-ghost text-xs px-3 py-1.5">
              {t('detail.cancel')}
            </button>
            <button onClick={save} disabled={saving} className="btn btn-blue text-xs px-3 py-1.5">
              {saving ? t('detail.saving') : t('detail.save')}
            </button>
          </>
        )}
      </div>

      <div className="px-5 py-2 text-[11px] text-muted font-mono truncate">
        {mem.relPath}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            className="grad-border w-full h-full min-h-[60vh] rounded-2xl p-4 font-mono text-sm leading-relaxed text-ink outline-none focus:shadow-soft resize-none"
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
    <div className="max-w-3xl fade-in">
      {Object.keys(meta).length > 0 && (
        <div className="grad-border mb-5 rounded-2xl p-4 text-sm shadow-soft">
          <div className="text-[10px] uppercase tracking-wide text-purple mb-2 font-display">{t('detail.frontmatter')}</div>
          <dl className="grid grid-cols-[minmax(7rem,max-content)_1fr] gap-x-3 gap-y-1.5">
            {flattenMeta(meta).map(([k, v]) => (
              <FrontmatterRow key={k} k={k} v={v} />
            ))}
          </dl>
        </div>
      )}
      <article className="text-[15px] leading-7 text-ink whitespace-pre-wrap">
        {linkify(mem.body)}
      </article>
      {mem.links.length > 0 && (
        <div className="mt-6 pt-4 border-t-2 border-[#EFE4FB]">
          <div className="text-[10px] uppercase tracking-wide text-purple mb-2 font-display">{t('detail.linksTo')}</div>
          <div className="flex flex-wrap gap-2">
            {mem.links.map((l) => (
              <span key={l} className="grad-border text-xs px-2.5 py-1 rounded-full text-purpleDeep">[[{l}]]</span>
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
      <dt className="text-muted font-mono text-xs pt-0.5 break-all">{k}</dt>
      <dd className="text-ink">{v}</dd>
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
      ? <span key={i} className="text-purpleDeep font-medium">{p}</span>
      : <span key={i}>{p}</span>
  );
}

function Empty() {
  const { t } = useI18n();
  return (
    <main className="flex-1 grid place-items-center text-center px-8 bg-cream">
      <div className="max-w-md pop">
        <div className="brain-badge w-24 h-24 mx-auto mb-4"><Brain className="w-16 h-16" /></div>
        <h2 className="font-display text-xl text-ink">{t('empty.title')}</h2>
        <p className="text-sm text-muted mt-2 leading-relaxed">
          {t('empty.body')}
        </p>
      </div>
    </main>
  );
}

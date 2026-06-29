import { createContext, useContext, useEffect, useState } from 'react';

// All user-facing strings live here. Add a key to both `en` and `zh`.
// Use {placeholders} for interpolation — see the `t()` helper below.
const DICT = {
  en: {
    'app.title': 'Agent Memory Inspector',
    'app.subtitle': 'local-first · no telemetry · reads what your agents already wrote',
    'stats.memories': 'memories',
    'stats.linked': 'linked',
    'stats.sources': 'sources',
    'header.rescan': '↻ Rescan',
    'header.scanning': 'Scanning…',
    'lang.switch': '中文',
    'sidebar.search': 'Search memories, paths…',
    'sidebar.all': 'All {n}',
    'sidebar.product': 'Product',
    'sidebar.scope': 'Scope',
    'sidebar.type': 'Type',
    'sidebar.typeAll': 'All types',
    'filter.clear': 'Clear',
    'product.claude-code': 'Claude Code',
    'product.codex': 'Codex',
    'product.cursor': 'Cursor',
    'product.other': 'other',
    'scope.project': 'project',
    'scope.user': 'user',
    'scope.global': 'global',
    'sidebar.scanning': 'Scanning your agent memory…',
    'sidebar.empty': 'No memories matched. Try clearing filters or running a coding agent first.',
    'row.index': 'INDEX',
    'detail.loading': 'Loading…',
    'detail.edit': '✎ Edit',
    'detail.delete': '🗑 Delete',
    'detail.confirmDelete': 'Delete this memory?',
    'detail.confirmYes': 'Delete',
    'detail.deleting': 'Deleting…',
    'detail.cancel': 'Cancel',
    'detail.save': 'Save',
    'detail.saving': 'Saving…',
    'detail.saved': 'Saved · .bak written',
    'detail.error': 'Error: {msg}',
    'detail.frontmatter': 'frontmatter',
    'detail.linksTo': 'links to',
    'empty.title': "Your agent's memory, made visible",
    'empty.body': 'Pick a memory on the left to read it, edit it, or prune what’s stale. Everything stays on your machine — nothing is uploaded.',
    'type.user': 'user',
    'type.feedback': 'feedback',
    'type.project': 'project',
    'type.reference': 'reference',
    'type.other': 'other',
  },
  zh: {
    'app.title': '智能体记忆检查器',
    'app.subtitle': '本地优先 · 零遥测 · 读取智能体已写下的记忆',
    'stats.memories': '条记忆',
    'stats.linked': '已关联',
    'stats.sources': '来源',
    'header.rescan': '↻ 重新扫描',
    'header.scanning': '扫描中…',
    'lang.switch': 'EN',
    'sidebar.search': '搜索记忆、路径…',
    'sidebar.all': '全部 {n}',
    'sidebar.product': '产品',
    'sidebar.scope': '范围',
    'sidebar.type': '类型',
    'sidebar.typeAll': '全部类型',
    'filter.clear': '清除',
    'product.claude-code': 'Claude Code',
    'product.codex': 'Codex',
    'product.cursor': 'Cursor',
    'product.other': '其他',
    'scope.project': '项目',
    'scope.user': '用户',
    'scope.global': '全局',
    'sidebar.scanning': '正在扫描智能体记忆…',
    'sidebar.empty': '没有匹配的记忆。试试清除筛选，或先运行一个编程智能体。',
    'row.index': '索引',
    'detail.loading': '加载中…',
    'detail.edit': '✎ 编辑',
    'detail.delete': '🗑 删除',
    'detail.confirmDelete': '确认删除这条记忆？',
    'detail.confirmYes': '删除',
    'detail.deleting': '删除中…',
    'detail.cancel': '取消',
    'detail.save': '保存',
    'detail.saving': '保存中…',
    'detail.saved': '已保存 · 已写入 .bak 备份',
    'detail.error': '错误：{msg}',
    'detail.frontmatter': '元数据',
    'detail.linksTo': '关联到',
    'empty.title': '让智能体的记忆变得可见',
    'empty.body': '在左侧选择一条记忆来阅读、编辑或清理过时内容。所有数据都留在你的机器上 —— 不会上传。',
    'type.user': '用户',
    'type.feedback': '反馈',
    'type.project': '项目',
    'type.reference': '参考',
    'type.other': '其他',
  },
};

const STORAGE_KEY = 'ami.lang';

function detectInitialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'zh') return saved;
  } catch { /* ignore */ }
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : '';
  return nav.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(detectInitialLang);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
  }, [lang]);

  const t = (key, vars) => {
    let s = DICT[lang][key] ?? DICT.en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
    return s;
  };

  const toggle = () => setLang((l) => (l === 'en' ? 'zh' : 'en'));

  return (
    <I18nContext.Provider value={{ lang, setLang, toggle, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

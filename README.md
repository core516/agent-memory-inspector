<div align="center">

**English** · [简体中文](README.zh-CN.md)

# 🧠 Agent Memory Inspector

### See, edit, and prune the memory your AI coding agents already wrote to disk.

**Local-first. Zero migration. No telemetry. One command.**

```bash
npx agent-memory-inspector
```

<!-- TODO before launch: replace with a real GIF of the UI (the single most important README asset).
     Record: launch → list of real memories → click one → edit → save. Keep it < 8s. -->
![Agent Memory Inspector UI](docs/hero.gif)

<sub>Your coding agent remembers things about you and your projects. This shows you exactly what — and lets you fix it.</sub>

</div>

---

## The problem

Your AI coding agent (Claude Code, Cursor, and friends) quietly writes **memory** to your disk — facts about you, your preferences, your projects, feedback you've given it. It's scattered across `~/.claude/`, `CLAUDE.md`, `AGENTS.md`, and `.cursor/rules`, in files you never look at.

So you have no idea:

- **What does my agent actually believe about me and my code?**
- Is something in there **stale, wrong, or embarrassing** — silently shaping every answer?
- Which memories are **linked** to which?

Agent Memory Inspector answers all three. It doesn't add another memory backend — it **reads the memory you already have** and makes it visible, searchable, and editable.

## What it does

- 🔍 **Discovers** memory across every agent convention on your machine — no config, no migration.
- 🗂️ **Browse & search** every fact, with three-axis filtering — by **product** (Claude Code · Codex · Cursor), by **scope** (project · user · global), and by **type** (`user` · `feedback` · `project` · `reference`).
- ✏️ **Edit & delete** in place — fix a stale fact, or remove a wrong one with a confirm step. Every edit *and* delete writes a `.bak` first, so it's always reversible.
- 🔗 **Follow the links** — see how memories cross-reference each other via `[[wikilinks]]`.
- 🔒 **Stays on your machine** — binds to `127.0.0.1`, makes zero outbound calls, ships zero telemetry.

## Quick start

```bash
# Run it — opens in your browser, scans automatically
npx agent-memory-inspector

# Or pin a port
PORT=4000 npx agent-memory-inspector
```

That's it. No account, no install, no cloud.

## What it reads

| Source | Product | Location |
| --- | --- | --- |
| Claude Code memory | Claude Code | `~/.claude/projects/<project>/memory/*.md` + `MEMORY.md` |
| Project brief | Claude Code | `CLAUDE.md` (cwd and home) |
| AGENTS.md | Codex | `AGENTS.md` in your project |
| Cursor rules | Cursor | `.cursor/rules/*.mdc` |

Every memory is tagged by **product** (which agent wrote it) and **scope** (project · user · global), so you can slice your memory whichever way you think about it.

Reading only. Edits and deletes go back to the **original file** with a `.bak` safety copy. Nothing leaves your disk.

## Why local-first

Your agent's memory is among the most personal data on your machine — it's a profile of how you work. Inspecting it should never require uploading it. This tool runs entirely on `localhost` and has no network code path at all.

## Development

```bash
git clone https://github.com/<org>/agent-memory-inspector
cd agent-memory-inspector
npm run build          # builds the web UI into web/dist
npm start              # serves UI + API on http://127.0.0.1:4317

# live UI development:
npm run dev:server     # terminal 1 — API with --watch
npm run dev:web        # terminal 2 — Vite dev server on :5173 (proxies /api)
```

Stack: zero-dependency Node server (built-ins only) + React + Vite + Tailwind. The server has **no runtime dependencies** so `npx` is instant on any machine.

## Roadmap

- ⏳ **Diff timeline** — see how a memory changed over time (via `.bak` history / git).
- 🕸️ **Link graph view** — visual map of how memories connect.
- 🧹 **Staleness hints** — flag memories that reference files/flags that no longer exist.
- 🔌 More sources: Windsurf, Cline, Continue, custom paths.

Contributions welcome — open an issue first so we can shape it together.

## License

MIT

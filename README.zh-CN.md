<div align="center">

[English](README.md) · **简体中文**

# 🧠 Agent Memory Inspector

### 查看、编辑并清理 AI 编程助手已写入磁盘的记忆。

**本地优先 · 零迁移 · 无遥测 · 一条命令搞定。**

```bash
npx agent-memory-inspector
```

<!-- 发布前 TODO：替换为真实的 UI 演示 GIF（这是 README 最重要的素材）。
     录制流程：启动 → 列出真实记忆 → 点击某条 → 编辑 → 保存。控制在 8 秒以内。 -->
![Agent Memory Inspector UI](docs/hero.gif)

<sub>你的编程助手记住了关于你和你项目的种种信息。本工具让你看清这些信息究竟是什么——并能随手修正。</sub>

</div>

---

## 痛点

你的 AI 编程助手（Claude Code、Cursor 等）会悄悄把**记忆**写入你的磁盘——关于你的事实、你的偏好、你的项目，以及你给过它的反馈。这些内容散落在 `~/.claude/`、`CLAUDE.md`、`AGENTS.md` 和 `.cursor/rules` 等你几乎从不查看的文件里。

于是你完全不知道：

- **我的助手到底"认为"我和我的代码是怎样的？**
- 里面是否藏着**过时、错误甚至令人尴尬**的信息——却在悄悄影响着每一次回答？
- 哪些记忆之间是**互相关联**的？

Agent Memory Inspector 一次性回答这三个问题。它不会再塞给你一个新的记忆后端——而是**读取你已有的记忆**，让它们变得可见、可搜索、可编辑。

## 功能

- 🔍 **自动发现**——扫描你机器上所有主流助手约定的记忆位置，无需配置、无需迁移。
- 🗂️ **浏览与搜索**——按类型（`user` · `feedback` · `project` · `reference`）筛选每一条事实。
- ✏️ **就地编辑与清理**——修正过时的事实或删除错误的内容。每次保存都会先写入一份 `.bak`，操作可回退。
- 🔗 **顺着链接看**——通过 `[[wikilinks]]` 查看记忆之间是如何互相引用的。
- 🔒 **数据不出本机**——绑定到 `127.0.0.1`，零对外请求，零遥测。

## 快速开始

```bash
# 直接运行——自动在浏览器中打开并开始扫描
npx agent-memory-inspector

# 或者指定端口
PORT=4000 npx agent-memory-inspector
```

就这么简单。无需账号、无需安装、不上云。

## 它会读取哪些内容

| 来源 | 位置 |
| --- | --- |
| Claude Code 记忆 | `~/.claude/projects/<project>/memory/*.md` + `MEMORY.md` |
| 项目说明 | `CLAUDE.md`（当前目录与主目录） |
| AGENTS.md | 项目中的 `AGENTS.md` |
| Cursor 规则 | `.cursor/rules/*.mdc` |

仅做读取。编辑会写回**原始文件**，并保留一份 `.bak` 安全副本。任何数据都不会离开你的磁盘。

## 为什么坚持本地优先

助手的记忆是你机器上最私密的数据之一——它是一份关于你工作方式的画像。查看它，绝不应该以上传它为代价。本工具完全运行在 `localhost`，且根本没有任何联网的代码路径。

## 开发

```bash
git clone https://github.com/<org>/agent-memory-inspector
cd agent-memory-inspector
npm run build          # 将 Web UI 构建到 web/dist
npm start              # 在 http://127.0.0.1:4317 提供 UI + API 服务

# 实时开发 UI：
npm run dev:server     # 终端 1 —— 带 --watch 的 API
npm run dev:web        # 终端 2 —— 运行在 :5173 的 Vite 开发服务器（代理 /api）
```

技术栈：零依赖 Node 服务（仅用内置模块）+ React + Vite + Tailwind。服务端**无任何运行时依赖**，因此在任意机器上 `npx` 都能瞬间启动。

## 路线图

- ⏳ **变更时间线**——通过 `.bak` 历史 / git 查看一条记忆随时间的变化。
- 🕸️ **链接图视图**——可视化记忆之间的关联关系。
- 🧹 **过时提示**——标记那些引用了已不存在的文件/参数的记忆。
- 🔌 更多来源：Windsurf、Cline、Continue、自定义路径。

欢迎贡献——请先开一个 issue，方便我们一起把方向打磨清楚。

## 许可证

MIT

# ai-workflow-memory

ai-workflow-memory 是一个本地 AI 协作开发记忆系统。它把 Codex、Claude、本地项目扫描、健康检查、行动项、阻塞、阶段快照和 Obsidian 导出串成一个轻量工作台，让多轮开发过程可以被检索、复盘和继续推进。

## 项目定位

这个项目优先解决三件事：

- 记忆不丢：采集 Codex / Claude 会话索引，沉淀到 SQLite，并提示摘要质量和可恢复性风险。
- 阶段能沉淀：按项目生成知识快照、阶段复盘、行动闭环证据和下一步建议。
- 同步可追踪：将 Daily、Actions、Strategy、Project 档案导出到 Obsidian，自动区可重写，手动备注区保留。

SQLite 是事实源，Obsidian 是阅读层和人工补充层。运行数据默认写到 `data/` 和 `output/`，不会提交到 Git。

## 安装

推荐使用 Node.js 24 或更新版本，因为项目使用 `node:sqlite`。

```powershell
npm install
```

复制本地配置模板：

```powershell
Copy-Item .env.example .env
```

按需填写 `.env`：

```bash
AIWM_DB_PATH=./data/memory.sqlite
AIWM_CODEX_INDEX_PATH=
AIWM_CLAUDE_HISTORY_PATH=
AIWM_CLAUDE_PROJECTS_ROOT=
AIWM_PROJECTS_ROOT=
AIWM_OBSIDIAN_VAULT=
```

如果不填写，默认值会使用：

- SQLite：`./data/memory.sqlite`
- Codex 索引：`~/.codex/session_index.jsonl`
- Claude history：`~/.claude/history.jsonl`
- Claude projects：`~/.claude/projects`
- 项目根目录：`~/Projects`
- Obsidian vault：`./output/obsidian-vault`

## 运行

启动开发服务：

```powershell
npm run dev
```

打开：

```text
http://localhost:32000
```

第一次使用建议顺序：

1. 配置 `.env` 中的项目根目录和 Obsidian vault。
2. 启动 `npm run dev`。
3. 在首页运行采集，或调用 `POST /api/ingest`。
4. 打开 `/memories`、`/projects`、`/health` 查看采集结果。
5. 打开 `/sync` 同步 Obsidian 自动区。

## 同步 Obsidian

同步入口：

- Web UI：`/sync`
- API：`POST /api/sync/obsidian`

同步会生成或更新：

- `Daily/YYYY-MM-DD.md`
- `Actions.md`
- `Strategy.md`
- `Memory Quality.md`
- `Projects/<project>.md`

每个导出文件包含自动区和手动区。自动区由系统重写，手动区由 `<!-- MANUAL_NOTES_START -->` 和 `<!-- MANUAL_NOTES_END -->` 包住，会在后续同步时保留。

## 测试命令

每个小目标完成后运行：

```powershell
npm test
npm run lint
npm run build
```

提交前还建议运行：

```powershell
git status --short --branch
git diff --check
```

## 文档

- [产品路线](docs/product-roadmap.md)
- [数据结构说明](docs/data-model.md)

## 开源注意事项

不要提交以下内容：

- `.env` 或真实本机路径配置。
- `data/*.sqlite`、WAL、备份文件。
- `output/` 下的 Obsidian 私密内容。
- 任何包含密钥、token、邮箱私密正文、公司内部资料或个人隐私的文件。

仓库已经通过 `.gitignore` 忽略 `.env*`、`data/*.sqlite*`、`output/`、`.next/`、`node_modules/` 等运行产物。

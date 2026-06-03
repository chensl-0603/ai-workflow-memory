# ai-workflow-memory
ai工作流总结，接入Obsidian建立ai工作知识库

## 本地配置

项目默认会把 SQLite 数据库放在 `data/memory.sqlite`，把 Obsidian 导出写到 `output/obsidian-vault`。这些目录不会提交到 Git。

需要连接真实 Codex、Claude、项目目录或 Obsidian vault 时，复制 `.env.example` 为 `.env`，再按本机路径填写：

```bash
AIWM_DB_PATH=./data/memory.sqlite
AIWM_CODEX_INDEX_PATH=
AIWM_CLAUDE_HISTORY_PATH=
AIWM_CLAUDE_PROJECTS_ROOT=
AIWM_PROJECTS_ROOT=
AIWM_OBSIDIAN_VAULT=
```

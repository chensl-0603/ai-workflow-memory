# 数据结构说明

ai-workflow-memory 使用 SQLite 作为事实源。Obsidian 只承接可阅读的自动区和人工补充区，不作为唯一数据来源。

默认数据库位置是 `data/memory.sqlite`，可以通过 `AIWM_DB_PATH` 修改。

## 核心表

### conversations

存储 Codex / Claude 会话记忆。

- `id`：稳定主键。
- `source`：`codex` 或 `claude`。
- `title`：会话标题。
- `summary`：正文摘要、标题兜底摘要或人工摘要。
- `summary_origin`：`thread-body`、`title-fallback`、`manual`。
- `project_path`：关联项目路径。
- `occurred_at`：发生时间。
- `raw_ref`：源索引引用。
- `tags`：JSON 字符串数组。

### project_snapshots

存储本地项目扫描结果。

- `path`：项目路径主键。
- `name`：项目名。
- `tech_stack`：JSON 字符串数组。
- `has_git`：是否为 Git 项目。
- `scripts`：package scripts 等入口脚本。
- `updated_at`：扫描更新时间。

### health_checks

存储最新一次健康检查状态。

- `id`：检查项 id，例如 `tool:FarmGame:maven`、`env:hotspot-hub`。
- `label`：显示名称。
- `status`：`ok`、`warn`、`fail`。
- `detail`：检查详情。
- `suggestion`：修复建议。
- `checked_at`：检查时间。

### health_check_history

存储健康检查历史趋势。

- `id`：由时间和检查项组成的历史主键。
- `check_id`：对应 `health_checks.id`。
- `label`、`status`、`detail`、`suggestion`：当次检查结果。
- `project_name`：从检查项 id 推导出的项目名。
- `checked_at`：当次采集时间。

这个表用于健康页趋势、阻塞看板重复环境异常、项目详情页最近环境状态变化。

### source_health_checks

存储 Codex / Claude 源索引状态。

- `source`：来源。
- `path`：索引路径。
- `file_exists`：文件是否存在。
- `item_count`：索引条数。
- `latest_updated_at`：源索引最新更新时间。
- `checked_at`：检查时间。
- `detail`：可读详情。

## 记忆质量与清理

### ignored_conversations

记录被清理忽略的会话 tombstone，防止后续采集重新导入。

### cleanup_runs

记录清理批次，用于撤销最近一次或指定批次清理。

### kept_archive_candidates

记录被人工保留的归档候选，避免自动质量清理误删。

## 项目沉淀

### project_knowledge_snapshots

存储项目阶段知识快照。

- 已落地能力。
- 当前架构。
- 数据来源。
- 测试信号。
- 已知缺口。
- 下一阶段路线。

### project_phase_reviews

存储每个小目标完成后的阶段复盘草稿。

- `completed_items`：完成内容。
- `verification_commands`：验证命令。
- `commits`：提交记录。
- `open_issues`：遗留问题。
- `next_steps`：下一步。

## 行动闭环

### daily_action_statuses

存储每日行动状态和完成证据。

- `date`：复盘日期。
- `action_id`：稳定行动 id。
- `status`：`open`、`done`、`skipped`、`snoozed`。
- `evidence`：提交、测试、同步或手动证据的 JSON 数组。
- `evidence_source`：证据来源。
- `completed_at`：完成时间。
- `updated_at`：状态更新时间。

## 同步审计

### sync_runs

存储 Obsidian 同步运行记录。

- `date`：同步对应日期。
- `status`：`ok` 或 `fail`。
- `project_count`：同步项目数量。
- `message`：结果说明。
- `failure_stage`：失败阶段。
- `ran_at`：运行时间。

### sync_target_snapshots

存储同步前后目标文件状态。

- `sync_run_id`：关联 `sync_runs.id`。
- `phase`：`before`、`after`、`failure`。
- `target_kind`：`daily`、`actions`、`strategy`、`project`。
- `target_path`：目标文件。
- `file_exists`、`size_bytes`、`updated_at`：文件状态。
- `captured_at`：快照时间。

## Obsidian 导出关系

Obsidian 文件由 SQLite 数据生成：

- Daily：来自 `conversations`、`project_snapshots`、`health_checks`、`daily_action_statuses`。
- Actions：来自行动收件箱聚合和完成证据。
- Strategy：来自项目档案手动区、阻塞、行动和阶段快照。
- Projects：来自项目详情、知识快照、阶段复盘和手动备注。
- Memory Quality：来自记忆质量审计、清理记录和保留候选。

自动区可以重复生成；手动区必须保留。

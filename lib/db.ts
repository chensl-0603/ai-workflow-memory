import { mkdir } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { tagConversation } from "./tags.ts";

export function openDatabase(dbPath: string) {
  return new DatabaseSync(dbPath);
}

type ConversationFallbackRow = {
  id: string;
  source: string;
  title: string;
  project_path: string | null;
};

function buildTitleFallbackSummary(title: string, tags: string[]) {
  const normalizedTitle = title.replace(/\s+/g, " ").trim();
  const clippedTitle = normalizedTitle.length > 220 ? `${normalizedTitle.slice(0, 219)}…` : normalizedTitle;
  const clues = tags.length > 0 ? `\n线索：${tags.join("、")}` : "";
  return `目标：${clippedTitle}\n进展：仅标题索引，待补正文。${clues}`;
}

function backfillEmptyConversationSummaries(db: DatabaseSync) {
  const rows = db
    .prepare(
      `SELECT id, source, title, project_path
       FROM conversations
       WHERE trim(summary) = '' OR (summary LIKE '目标：%' AND summary NOT LIKE '%进展：%')`
    )
    .all() as ConversationFallbackRow[];

  if (rows.length === 0) return;

  const update = db.prepare("UPDATE conversations SET summary = ?, summary_origin = 'title-fallback' WHERE id = ?");
  for (const row of rows) {
    const source = row.source === "claude" ? "claude" : "codex";
    const tags = tagConversation({
      title: row.title,
      projectPath: row.project_path,
      source
    });
    update.run(buildTitleFallbackSummary(row.title, tags), row.id);
  }
}

export async function ensureDatabase(dbPath: string) {
  await mkdir(path.dirname(dbPath), { recursive: true });
  const db = openDatabase(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      summary_origin TEXT NOT NULL DEFAULT 'thread-body',
      project_path TEXT,
      occurred_at TEXT NOT NULL,
      raw_ref TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS ignored_conversations (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL,
      ignored_at TEXT NOT NULL,
      cleanup_run_id TEXT
    );

    CREATE TABLE IF NOT EXISTS cleanup_runs (
      id TEXT PRIMARY KEY,
      filter_label TEXT NOT NULL,
      ignored_count INTEGER NOT NULL,
      deleted_count INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      undone_at TEXT
    );

    CREATE TABLE IF NOT EXISTS kept_archive_candidates (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      kept_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_snapshots (
      path TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tech_stack TEXT NOT NULL,
      has_git INTEGER NOT NULL,
      scripts TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS health_checks (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      status TEXT NOT NULL,
      detail TEXT NOT NULL,
      suggestion TEXT,
      checked_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS health_check_history (
      id TEXT PRIMARY KEY,
      check_id TEXT NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL,
      detail TEXT NOT NULL,
      suggestion TEXT,
      project_name TEXT,
      checked_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS source_health_checks (
      source TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      file_exists INTEGER NOT NULL,
      item_count INTEGER NOT NULL,
      latest_updated_at TEXT,
      checked_at TEXT NOT NULL,
      detail TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_knowledge_snapshots (
      id TEXT PRIMARY KEY,
      project_path TEXT NOT NULL,
      project_name TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      summary TEXT NOT NULL,
      shipped_features TEXT NOT NULL,
      current_architecture TEXT NOT NULL,
      data_sources TEXT NOT NULL,
      test_signals TEXT NOT NULL,
      known_gaps TEXT NOT NULL,
      next_milestones TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_phase_reviews (
      id TEXT PRIMARY KEY,
      project_path TEXT NOT NULL,
      project_name TEXT NOT NULL,
      milestone TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      summary TEXT NOT NULL,
      completed_items TEXT NOT NULL,
      verification_commands TEXT NOT NULL,
      commits TEXT NOT NULL,
      open_issues TEXT NOT NULL,
      next_steps TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_action_statuses (
      date TEXT NOT NULL,
      action_id TEXT NOT NULL,
      status TEXT NOT NULL,
      evidence TEXT NOT NULL DEFAULT '[]',
      evidence_source TEXT,
      completed_at TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (date, action_id)
    );

    CREATE TABLE IF NOT EXISTS sync_runs (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      status TEXT NOT NULL,
      project_count INTEGER NOT NULL,
      message TEXT NOT NULL,
      failure_stage TEXT,
      ran_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_target_snapshots (
      id TEXT PRIMARY KEY,
      sync_run_id TEXT NOT NULL,
      phase TEXT NOT NULL,
      target_kind TEXT NOT NULL,
      target_label TEXT NOT NULL,
      target_path TEXT NOT NULL,
      file_exists INTEGER NOT NULL,
      size_bytes INTEGER NOT NULL,
      updated_at TEXT,
      captured_at TEXT NOT NULL
    );
  `);
  const columns = db.prepare("PRAGMA table_info(conversations)").all() as { name: string }[];
  if (!columns.some((column) => column.name === "tags")) {
    db.exec("ALTER TABLE conversations ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'");
  }
  if (!columns.some((column) => column.name === "summary")) {
    db.exec("ALTER TABLE conversations ADD COLUMN summary TEXT NOT NULL DEFAULT ''");
  }
  if (!columns.some((column) => column.name === "summary_origin")) {
    db.exec("ALTER TABLE conversations ADD COLUMN summary_origin TEXT NOT NULL DEFAULT 'thread-body'");
  }
  db.exec(
    `UPDATE conversations
     SET summary_origin = 'title-fallback'
     WHERE summary_origin <> 'manual'
       AND summary LIKE '%进展：仅标题索引，待补正文。%'`
  );
  const ignoredConversationColumns = db.prepare("PRAGMA table_info(ignored_conversations)").all() as { name: string }[];
  if (!ignoredConversationColumns.some((column) => column.name === "source")) {
    db.exec("ALTER TABLE ignored_conversations ADD COLUMN source TEXT NOT NULL DEFAULT ''");
  }
  if (!ignoredConversationColumns.some((column) => column.name === "title")) {
    db.exec("ALTER TABLE ignored_conversations ADD COLUMN title TEXT NOT NULL DEFAULT ''");
  }
  if (!ignoredConversationColumns.some((column) => column.name === "cleanup_run_id")) {
    db.exec("ALTER TABLE ignored_conversations ADD COLUMN cleanup_run_id TEXT");
  }
  const syncRunColumns = db.prepare("PRAGMA table_info(sync_runs)").all() as { name: string }[];
  if (!syncRunColumns.some((column) => column.name === "failure_stage")) {
    db.exec("ALTER TABLE sync_runs ADD COLUMN failure_stage TEXT");
  }
  const dailyActionStatusColumns = db.prepare("PRAGMA table_info(daily_action_statuses)").all() as { name: string }[];
  if (!dailyActionStatusColumns.some((column) => column.name === "evidence")) {
    db.exec("ALTER TABLE daily_action_statuses ADD COLUMN evidence TEXT NOT NULL DEFAULT '[]'");
  }
  if (!dailyActionStatusColumns.some((column) => column.name === "evidence_source")) {
    db.exec("ALTER TABLE daily_action_statuses ADD COLUMN evidence_source TEXT");
  }
  if (!dailyActionStatusColumns.some((column) => column.name === "completed_at")) {
    db.exec("ALTER TABLE daily_action_statuses ADD COLUMN completed_at TEXT");
  }
  backfillEmptyConversationSummaries(db);
  return db;
}

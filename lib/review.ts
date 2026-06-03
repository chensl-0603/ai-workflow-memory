import { ensureDatabase } from "./db.ts";
import type { ConversationItem, DailyReview, HealthCheckResult, ProjectSnapshot } from "./types.ts";

type ConversationRow = {
  id: string;
  source: string;
  title: string;
  summary: string;
  summary_origin: string;
  project_path: string | null;
  occurred_at: string;
  raw_ref: string;
  tags: string;
};

type ProjectRow = {
  path: string;
  name: string;
  tech_stack: string;
  has_git: number;
  scripts: string;
  updated_at: string;
};

type HealthRow = {
  id: string;
  label: string;
  status: string;
  detail: string;
  suggestion: string | null;
};

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export async function getDailyReview(dbPath: string, date: string): Promise<DailyReview> {
  const db = await ensureDatabase(dbPath);
  try {
    const conversations = db
      .prepare(
        `SELECT id, source, title, summary, summary_origin, project_path, occurred_at, raw_ref, tags
         FROM conversations
         WHERE substr(occurred_at, 1, 10) = ?
         ORDER BY occurred_at DESC`
      )
      .all(date) as ConversationRow[];
    const projects = db
      .prepare(
        `SELECT path, name, tech_stack, has_git, scripts, updated_at
         FROM project_snapshots
         ORDER BY updated_at DESC`
      )
      .all() as ProjectRow[];
    const health = db
      .prepare(
        `SELECT id, label, status, detail, suggestion
         FROM health_checks
         ORDER BY id ASC`
      )
      .all() as HealthRow[];

    const mappedConversations: ConversationItem[] = conversations.map((row) => ({
      id: row.id,
      source: row.source === "claude" ? "claude" : "codex",
      title: row.title,
      summary: row.summary,
      summaryOrigin:
        row.summary_origin === "manual" ? "manual" : row.summary_origin === "title-fallback" ? "title-fallback" : "thread-body",
      projectPath: row.project_path,
      occurredAt: row.occurred_at,
      rawRef: row.raw_ref,
      tags: parseJsonArray(row.tags)
    }));
    const mappedProjects: ProjectSnapshot[] = projects.map((row) => ({
      path: row.path,
      name: row.name,
      techStack: parseJsonArray(row.tech_stack),
      hasGit: Boolean(row.has_git),
      scripts: parseJsonArray(row.scripts),
      updatedAt: row.updated_at
    }));
    const mappedHealth: HealthCheckResult[] = health.map((row) => ({
      id: row.id,
      label: row.label,
      status: row.status === "fail" ? "fail" : row.status === "warn" ? "warn" : "ok",
      detail: row.detail,
      suggestion: row.suggestion
    }));

    const warnCount = mappedHealth.filter((check) => check.status !== "ok").length;
    const summary = `${date}：沉淀 ${mappedConversations.length} 条对话，追踪 ${mappedProjects.length} 个项目，发现 ${warnCount} 个环境提醒。`;

    return {
      date,
      summary,
      conversations: mappedConversations,
      projects: mappedProjects,
      health: mappedHealth
    };
  } finally {
    db.close();
  }
}

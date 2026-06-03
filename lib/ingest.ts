import { stat } from "node:fs/promises";
import path from "node:path";

import type { AppConfig, ConversationItem, HealthCheckResult, ProjectSnapshot, SourceHealthItem } from "./types.ts";
import { cleanupDeletedProjectMemories } from "./cleanup.ts";
import { ensureDatabase } from "./db.ts";
import { readClaudeConversations, readCodexConversations } from "./conversations.ts";
import { scanProjects } from "./projects.ts";
import { runHealthChecks } from "./health.ts";
import { collectSourceHealth } from "./source-health.ts";

async function projectPathExists(projectPath: string | null) {
  if (!projectPath) return true;
  try {
    await stat(projectPath);
    return true;
  } catch {
    return false;
  }
}

function insertConversation(db: Awaited<ReturnType<typeof ensureDatabase>>, item: ConversationItem) {
  const existed = db.prepare("SELECT 1 FROM conversations WHERE id = ?").get(item.id);
  db
    .prepare(
      `INSERT INTO conversations
       (id, source, title, summary, summary_origin, project_path, occurred_at, raw_ref, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         source = excluded.source,
         title = excluded.title,
         summary = CASE WHEN conversations.summary_origin = 'manual' THEN conversations.summary ELSE excluded.summary END,
         summary_origin = CASE WHEN conversations.summary_origin = 'manual' THEN conversations.summary_origin ELSE excluded.summary_origin END,
         project_path = excluded.project_path,
         occurred_at = excluded.occurred_at,
         raw_ref = excluded.raw_ref,
         tags = excluded.tags`
    )
    .run(
      item.id,
      item.source,
      item.title,
      item.summary,
      item.summaryOrigin,
      item.projectPath,
      item.occurredAt,
      item.rawRef,
      JSON.stringify(item.tags)
    );
  return existed ? 0 : 1;
}

function upsertProject(db: Awaited<ReturnType<typeof ensureDatabase>>, project: ProjectSnapshot) {
  db.prepare(
    `INSERT INTO project_snapshots
     (path, name, tech_stack, has_git, scripts, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET
       name = excluded.name,
       tech_stack = excluded.tech_stack,
       has_git = excluded.has_git,
       scripts = excluded.scripts,
       updated_at = excluded.updated_at`
  ).run(
    project.path,
    project.name,
    JSON.stringify(project.techStack),
    project.hasGit ? 1 : 0,
    JSON.stringify(project.scripts),
    project.updatedAt
  );
}

function upsertHealth(db: Awaited<ReturnType<typeof ensureDatabase>>, check: HealthCheckResult) {
  db.prepare(
    `INSERT INTO health_checks
     (id, label, status, detail, suggestion, checked_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       label = excluded.label,
       status = excluded.status,
       detail = excluded.detail,
       suggestion = excluded.suggestion,
       checked_at = excluded.checked_at`
  ).run(check.id, check.label, check.status, check.detail, check.suggestion, new Date().toISOString());
}

function upsertSourceHealth(db: Awaited<ReturnType<typeof ensureDatabase>>, source: SourceHealthItem) {
  db.prepare(
    `INSERT INTO source_health_checks
     (source, path, file_exists, item_count, latest_updated_at, checked_at, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source) DO UPDATE SET
       path = excluded.path,
       file_exists = excluded.file_exists,
       item_count = excluded.item_count,
       latest_updated_at = excluded.latest_updated_at,
       checked_at = excluded.checked_at,
       detail = excluded.detail`
  ).run(source.source, source.path, source.exists ? 1 : 0, source.itemCount, source.latestUpdatedAt, source.checkedAt, source.detail);
}

function buildProjectEnvChecks(projects: ProjectSnapshot[]) {
  return projects
    .filter((project) => project.techStack.some((tech) => tech === "Next.js" || tech === "Node.js"))
    .map((project) => ({
      id: `env:${project.name}`,
      label: `${project.name} 环境变量文件`,
      path: path.join(project.path, ".env.local")
    }));
}

export async function ingestAllSources(config: AppConfig) {
  const cleanup = await cleanupDeletedProjectMemories(config.dbPath);
  const db = await ensureDatabase(config.dbPath);
  try {
    const [codex, claude, projects, sources] = await Promise.all([
      readCodexConversations(config.codexIndexPath),
      readClaudeConversations(config.claudeHistoryPath, config.claudeProjectsRoot),
      scanProjects(config.projectsRoot),
      collectSourceHealth(config)
    ]);
    const health = await runHealthChecks({
      envFiles: buildProjectEnvChecks(projects)
    });

    const uniqueConversations = new Map<string, ConversationItem>();
    const staleDeletedProjectConversationIds: string[] = [];
    let skippedDeletedProjectConversations = 0;
    let skippedIgnoredConversations = 0;
    const isIgnoredConversation = db.prepare("SELECT 1 FROM ignored_conversations WHERE id = ?");
    for (const item of [...codex, ...claude]) {
      if (isIgnoredConversation.get(item.id)) {
        skippedIgnoredConversations += 1;
        continue;
      }
      if (!(await projectPathExists(item.projectPath))) {
        skippedDeletedProjectConversations += 1;
        staleDeletedProjectConversationIds.push(item.id);
        continue;
      }
      uniqueConversations.set(item.id, item);
    }

    let insertedConversations = 0;
    let deletedSkippedProjectConversations = 0;
    db.exec("BEGIN");
    try {
      const deleteConversation = db.prepare("DELETE FROM conversations WHERE id = ?");
      for (const id of staleDeletedProjectConversationIds) {
        deletedSkippedProjectConversations += Number(deleteConversation.run(id).changes);
      }
      for (const item of uniqueConversations.values()) {
        insertedConversations += Number(insertConversation(db, item));
      }
      for (const project of projects) {
        upsertProject(db, project);
      }
      for (const check of health) {
        upsertHealth(db, check);
      }
      for (const source of sources) {
        upsertSourceHealth(db, source);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return {
      conversations: insertedConversations,
      projects: projects.length,
      health: health.length,
      sources: sources.length,
      skippedIgnoredConversations,
      skippedDeletedProjectConversations,
      deletedSkippedProjectConversations,
      cleanedDeletedProjectConversations: cleanup.deletedConversations,
      cleanedDeletedProjectSnapshots: cleanup.deletedProjectSnapshots
    };
  } finally {
    db.close();
  }
}

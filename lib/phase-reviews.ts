import { ensureDatabase } from "./db.ts";
import { getProjectDetail } from "./project-detail.ts";
import type { ProjectPhaseReview, ProjectPhaseReviewCommit } from "./types.ts";

type ProjectPhaseReviewRow = {
  id: string;
  project_path: string;
  project_name: string;
  milestone: string;
  completed_at: string;
  summary: string;
  completed_items: string;
  verification_commands: string;
  commits: string;
  open_issues: string;
  next_steps: string;
};

type GenerateProjectPhaseReviewOptions = {
  dbPath: string;
  projectName: string;
  milestone: string;
  completedAt?: string;
  completedItems: string[];
  verificationCommands: string[];
  commits: ProjectPhaseReviewCommit[];
  openIssues: string[];
  nextSteps: string[];
};

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseCommits(value: string): ProjectPhaseReviewCommit[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const record = item as Record<string, unknown>;
        return typeof record.hash === "string" && typeof record.message === "string"
          ? { hash: record.hash, message: record.message }
          : null;
      })
      .filter((item): item is ProjectPhaseReviewCommit => Boolean(item));
  } catch {
    return [];
  }
}

function mapRow(row: ProjectPhaseReviewRow): ProjectPhaseReview {
  return {
    id: row.id,
    projectPath: row.project_path,
    projectName: row.project_name,
    milestone: row.milestone,
    completedAt: row.completed_at,
    summary: row.summary,
    completedItems: parseJsonArray(row.completed_items),
    verificationCommands: parseJsonArray(row.verification_commands),
    commits: parseCommits(row.commits),
    openIssues: parseJsonArray(row.open_issues),
    nextSteps: parseJsonArray(row.next_steps)
  };
}

function stableReviewId(projectPath: string, milestone: string, completedAt: string) {
  return `phase:${projectPath}:${milestone}:${completedAt}`.replace(/\s+/g, " ").trim();
}

function buildSummary(options: GenerateProjectPhaseReviewOptions) {
  const next = options.nextSteps[0] ?? "继续按项目计划推进。";
  return `${options.milestone} 已形成阶段复盘草稿：${options.completedItems.length} 项完成内容、${options.verificationCommands.length} 条验证命令、${options.commits.length} 个提交；下一步：${next}`;
}

export async function saveProjectPhaseReview(dbPath: string, review: ProjectPhaseReview) {
  const db = await ensureDatabase(dbPath);
  try {
    db.prepare(
      `INSERT INTO project_phase_reviews
       (id, project_path, project_name, milestone, completed_at, summary, completed_items, verification_commands, commits, open_issues, next_steps)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         project_path = excluded.project_path,
         project_name = excluded.project_name,
         milestone = excluded.milestone,
         completed_at = excluded.completed_at,
         summary = excluded.summary,
         completed_items = excluded.completed_items,
         verification_commands = excluded.verification_commands,
         commits = excluded.commits,
         open_issues = excluded.open_issues,
         next_steps = excluded.next_steps`
    ).run(
      review.id,
      review.projectPath,
      review.projectName,
      review.milestone,
      review.completedAt,
      review.summary,
      JSON.stringify(review.completedItems),
      JSON.stringify(review.verificationCommands),
      JSON.stringify(review.commits),
      JSON.stringify(review.openIssues),
      JSON.stringify(review.nextSteps)
    );
  } finally {
    db.close();
  }
}

export async function generateProjectPhaseReview(options: GenerateProjectPhaseReviewOptions): Promise<ProjectPhaseReview | null> {
  const detail = await getProjectDetail(options.dbPath, options.projectName);
  if (!detail) return null;
  const completedAt = options.completedAt ?? new Date().toISOString();
  const review: ProjectPhaseReview = {
    id: stableReviewId(detail.project.path, options.milestone, completedAt),
    projectPath: detail.project.path,
    projectName: detail.project.name,
    milestone: options.milestone,
    completedAt,
    summary: buildSummary(options),
    completedItems: options.completedItems,
    verificationCommands: options.verificationCommands,
    commits: options.commits,
    openIssues: options.openIssues,
    nextSteps: options.nextSteps
  };
  await saveProjectPhaseReview(options.dbPath, review);
  return review;
}

export async function getLatestProjectPhaseReview(dbPath: string, projectName: string) {
  const db = await ensureDatabase(dbPath);
  try {
    const row = db
      .prepare(
        `SELECT id, project_path, project_name, milestone, completed_at, summary, completed_items, verification_commands, commits, open_issues, next_steps
         FROM project_phase_reviews
         WHERE lower(project_name) = lower(?) OR lower(project_path) LIKE ?
         ORDER BY completed_at DESC
         LIMIT 1`
      )
      .get(projectName, `%${projectName.toLocaleLowerCase("zh-CN")}%`) as ProjectPhaseReviewRow | undefined;
    return row ? mapRow(row) : null;
  } finally {
    db.close();
  }
}

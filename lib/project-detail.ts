import { ensureDatabase } from "./db.ts";
import { projectNameFromHealthCheckId } from "./health.ts";
import { getMemoryQualityReport } from "./memory-quality.ts";
import { searchMemories } from "./search.ts";
import type { ConversationItem, HealthCheckResult, MemoryQualityItem, ProjectDetail, ProjectMemoryCoverage, ProjectSnapshot } from "./types.ts";

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

function toProject(row: ProjectRow): ProjectSnapshot {
  return {
    path: row.path,
    name: row.name,
    techStack: parseJsonArray(row.tech_stack),
    hasGit: Boolean(row.has_git),
    scripts: parseJsonArray(row.scripts),
    updatedAt: row.updated_at
  };
}

function toHealth(row: HealthRow): HealthCheckResult {
  return {
    id: row.id,
    label: row.label,
    status: row.status === "fail" ? "fail" : row.status === "warn" ? "warn" : "ok",
    detail: row.detail,
    suggestion: row.suggestion
  };
}

function buildNextActions(detail: {
  project: ProjectSnapshot;
  relatedTags: string[];
  health: HealthCheckResult[];
  memoryCoverage: ProjectMemoryCoverage;
}) {
  const actions: string[] = [];
  if (detail.memoryCoverage.status !== "ok") {
    actions.push(detail.memoryCoverage.suggestions[0] ?? "优先补齐这个项目的标题兜底记忆，降低上下文丢失风险。");
  }
  if (detail.relatedTags.some((tag) => tag === "构建" || tag === "环境")) {
    actions.push("优先复查构建环境，把 JAVA_HOME、Gradle、依赖脚本这些阻塞项处理干净。");
  }
  if (detail.project.scripts.length > 0) {
    actions.push(`把常用脚本固定成项目入口：${detail.project.scripts.slice(0, 4).join("、")}。`);
  }
  if (detail.health.some((check) => check.status !== "ok")) {
    actions.push("查看环境健康检查，把 warning 项和项目近期报错对应起来。");
  }
  if (detail.relatedTags.includes("前端")) {
    actions.push("整理这个项目的前端设计决策，后续可以沉淀到项目档案。");
  }
  if (actions.length === 0) {
    actions.push("补充这个项目的下一次目标，让记忆系统能持续追踪进展。");
  }
  return actions;
}

function buildProjectMemoryCoverage(memories: ConversationItem[], qualityById: Map<string, MemoryQualityItem>): ProjectMemoryCoverage {
  const totalMemories = memories.length;
  const qualityItems = memories.map((memory) => qualityById.get(memory.id)).filter((item): item is MemoryQualityItem => Boolean(item));
  const threadBodyMemories = qualityItems.filter((item) => item.summaryOrigin === "thread-body").length;
  const titleFallbackMemories = qualityItems.filter((item) => item.summaryOrigin === "title-fallback").length;
  const manualMemories = qualityItems.filter((item) => item.summaryOrigin === "manual").length;
  const sourceMissingMemories = qualityItems.filter((item) => item.recoverability.status === "source-missing").length;
  const suggestions: string[] = [];

  if (sourceMissingMemories > 0) {
    suggestions.push(`优先补摘要：${sourceMissingMemories} 条记忆的源索引缺失，自动恢复风险最高。`);
  }
  if (titleFallbackMemories > 0) {
    suggestions.push(`补摘要：${titleFallbackMemories} 条标题兜底记忆还没有正文摘要。`);
  }
  if (totalMemories === 0) {
    suggestions.push("重新采集或确认项目路径关联，让这个项目至少有一条可追溯记忆。");
  }
  if (suggestions.length === 0) {
    suggestions.push("当前项目记忆覆盖稳定，后续保持阶段快照和复盘同步。");
  }

  const status = sourceMissingMemories > 0 || totalMemories === 0 ? ("fail" as const) : titleFallbackMemories > 0 ? ("warn" as const) : ("ok" as const);
  const summary =
    totalMemories === 0
      ? "这个项目还没有关联记忆。"
      : status === "ok"
        ? `当前 ${totalMemories} 条关联记忆都有正文摘要或人工摘要。`
        : `当前 ${totalMemories} 条关联记忆中，${titleFallbackMemories} 条标题兜底，${sourceMissingMemories} 条源索引缺失。`;

  return {
    status,
    summary,
    totalMemories,
    threadBodyMemories,
    titleFallbackMemories,
    manualMemories,
    sourceMissingMemories,
    suggestions
  };
}

export async function getProjectDetail(dbPath: string, projectName: string): Promise<ProjectDetail | null> {
  const db = await ensureDatabase(dbPath);
  try {
    const row = db
      .prepare(
        `SELECT path, name, tech_stack, has_git, scripts, updated_at
         FROM project_snapshots
         WHERE lower(name) = lower(?)
         LIMIT 1`
      )
      .get(projectName) as ProjectRow | undefined;

    if (!row) return null;

    const project = toProject(row);
    const memoryResult = await searchMemories(dbPath, { project: project.name, limit: 50 });
    const fallbackMemoryResult =
      memoryResult.items.length > 0 ? memoryResult : await searchMemories(dbPath, { project: project.path, limit: 50 });
    const relatedTags = Array.from(new Set(fallbackMemoryResult.items.flatMap((item) => item.tags))).sort((a, b) =>
      a.localeCompare(b, "zh-CN")
    );
    const qualityReport = await getMemoryQualityReport(dbPath, { limit: Number.MAX_SAFE_INTEGER });
    const qualityById = new Map(qualityReport.items.map((item) => [item.memory.id, item]));
    const memoryCoverage = buildProjectMemoryCoverage(fallbackMemoryResult.items, qualityById);
    const healthRows = db
      .prepare(
        `SELECT id, label, status, detail, suggestion
         FROM health_checks
         ORDER BY id ASC`
      )
      .all() as HealthRow[];
    const health = healthRows.map(toHealth).filter((check) => {
      const scopedProjectName = projectNameFromHealthCheckId(check.id);
      if (scopedProjectName) {
        return scopedProjectName.toLocaleLowerCase("zh-CN") === project.name.toLocaleLowerCase("zh-CN");
      }
      return relatedTags.some((tag) => check.label.toLocaleLowerCase("zh-CN").includes(tag.toLocaleLowerCase("zh-CN")));
    });

    const nextActions = buildNextActions({ project, relatedTags, health, memoryCoverage });

    return {
      project,
      memories: fallbackMemoryResult.items,
      relatedTags,
      health,
      memoryCoverage,
      nextActions
    };
  } finally {
    db.close();
  }
}

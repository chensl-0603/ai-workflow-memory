import { readFile } from "node:fs/promises";
import path from "node:path";

import { ensureDatabase } from "./db.ts";
import { getProjectDetail } from "./project-detail.ts";
import { getSourceHealthReport } from "./source-health.ts";
import type { ProjectDetail, ProjectKnowledgeSnapshot } from "./types.ts";

type ProjectKnowledgeRow = {
  id: string;
  project_path: string;
  project_name: string;
  captured_at: string;
  summary: string;
  shipped_features: string;
  current_architecture: string;
  data_sources: string;
  test_signals: string;
  known_gaps: string;
  next_milestones: string;
};

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function stableSnapshotId(projectPath: string, capturedAt: string) {
  return `knowledge:${projectPath}:${capturedAt}`.replace(/\s+/g, " ").trim();
}

function mapRow(row: ProjectKnowledgeRow): ProjectKnowledgeSnapshot {
  return {
    id: row.id,
    projectPath: row.project_path,
    projectName: row.project_name,
    capturedAt: row.captured_at,
    summary: row.summary,
    shippedFeatures: parseJsonArray(row.shipped_features),
    currentArchitecture: parseJsonArray(row.current_architecture),
    dataSources: parseJsonArray(row.data_sources),
    testSignals: parseJsonArray(row.test_signals),
    knownGaps: parseJsonArray(row.known_gaps),
    nextMilestones: parseJsonArray(row.next_milestones)
  };
}

function unique(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function buildShippedFeatures(detail: ProjectDetail) {
  const fromMemories = detail.memories.slice(0, 6).map((memory) => `${memory.source === "codex" ? "Codex" : "Claude"}：${memory.title}`);
  const healthFeatures = detail.health.some((check) => check.status !== "ok")
    ? ["恢复构建环境可见性：环境提醒已经进入项目详情、阻塞和行动建议。"]
    : [];
  const archiveFeature = ["项目知识库承接：项目档案会保留自动区和 Obsidian 手动区。"];
  return unique([...fromMemories, ...healthFeatures, ...archiveFeature]);
}

function buildArchitecture(detail: ProjectDetail) {
  const scripts = detail.project.scripts.length > 0 ? detail.project.scripts.join("、") : "暂无脚本";
  return unique([
    `技术栈：${detail.project.techStack.join(" / ")}`,
    `入口脚本：${scripts}`,
    `仓库状态：${detail.project.hasGit ? "Git 项目" : "普通目录"}`,
    "当前架构：SQLite 是事实源，Next.js 页面负责本地驾驶舱，Obsidian Markdown 是可再生成知识库视图。"
  ]);
}

async function readTestSignals() {
  try {
    const content = await readFile(path.join(process.cwd(), "tests", "workflow-core.test.ts"), "utf8");
    return unique(
      Array.from(content.matchAll(/^test\("([^"]+)"/gm))
        .map((match) => match[1])
        .filter((name) => /project|memory|sync|health|action|daily|strategy/i.test(name))
        .slice(0, 16)
    );
  } catch {
    return ["尚未读取到测试文件；下一步补充测试信号。"];
  }
}

async function buildDataSources(dbPath: string, detail: ProjectDetail) {
  const sourceReport = await getSourceHealthReport(dbPath);
  const sourceLines = sourceReport.items.map(
    (item) =>
      `${item.source === "codex" ? "Codex" : "Claude"} 索引：${item.exists ? "存在" : "缺失"}，${item.itemCount} 条，最新 ${
        item.latestUpdatedAt ?? "未知"
      }。`
  );
  const projectLine = `项目扫描：${detail.project.path}，${detail.memories.length} 条关联记忆，${detail.health.filter((check) => check.status !== "ok").length} 个提醒。`;
  return unique([projectLine, ...sourceLines]);
}

function buildKnownGaps(detail: ProjectDetail) {
  const gaps: string[] = [];
  if (detail.memories.length <= 1) {
    gaps.push("知识库仍偏薄：当前项目关联记忆不足，阶段上下文容易再次断层。");
  }
  if (!detail.project.hasGit) {
    gaps.push("项目尚未纳入 Git：代码历史和回滚点不足。");
  }
  if (detail.health.some((check) => check.status !== "ok")) {
    gaps.push("环境提醒仍存在：需要把反复出现的问题转成阻塞和行动闭环。");
  }
  gaps.push("项目知识库需要阶段快照：自动区应沉淀已完成能力、当前架构和下一阶段路线。");
  return unique(gaps);
}

function buildNextMilestones(detail: ProjectDetail) {
  const milestones = [
    "生成项目阶段快照，并在 Obsidian 项目档案中持续展示。",
    "补齐源索引健康检查，避免 Codex/Claude 历史丢失后只剩残缺摘要。",
    "把行动建议升级为带优先级、重复原因和完成证据的闭环。"
  ];
  if (detail.health.some((check) => check.status !== "ok")) {
    milestones.push("按项目技术栈细化健康检查，自动关联环境异常到项目阻塞。");
  }
  return milestones;
}

function buildSummary(detail: ProjectDetail) {
  return `${detail.project.name} 当前是 ${detail.project.techStack.join(" / ")} 项目，已沉淀 ${detail.memories.length} 条关联记忆、${
    detail.health.filter((check) => check.status !== "ok").length
  } 个环境提醒；下一阶段重点是把 AI 记忆、项目复盘和开发环境监测汇入持续更新的项目知识库。`;
}

export async function saveProjectKnowledgeSnapshot(dbPath: string, snapshot: ProjectKnowledgeSnapshot) {
  const db = await ensureDatabase(dbPath);
  try {
    db.prepare(
      `INSERT INTO project_knowledge_snapshots
       (id, project_path, project_name, captured_at, summary, shipped_features, current_architecture, data_sources, test_signals, known_gaps, next_milestones)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         project_path = excluded.project_path,
         project_name = excluded.project_name,
         captured_at = excluded.captured_at,
         summary = excluded.summary,
         shipped_features = excluded.shipped_features,
         current_architecture = excluded.current_architecture,
         data_sources = excluded.data_sources,
         test_signals = excluded.test_signals,
         known_gaps = excluded.known_gaps,
         next_milestones = excluded.next_milestones`
    ).run(
      snapshot.id,
      snapshot.projectPath,
      snapshot.projectName,
      snapshot.capturedAt,
      snapshot.summary,
      JSON.stringify(snapshot.shippedFeatures),
      JSON.stringify(snapshot.currentArchitecture),
      JSON.stringify(snapshot.dataSources),
      JSON.stringify(snapshot.testSignals),
      JSON.stringify(snapshot.knownGaps),
      JSON.stringify(snapshot.nextMilestones)
    );
  } finally {
    db.close();
  }
}

export async function generateProjectKnowledgeSnapshot(options: {
  dbPath: string;
  obsidianVault: string;
  projectName: string;
  capturedAt?: string;
}): Promise<ProjectKnowledgeSnapshot | null> {
  void options.obsidianVault;
  const detail = await getProjectDetail(options.dbPath, options.projectName);
  if (!detail) return null;
  const capturedAt = options.capturedAt ?? new Date().toISOString();
  const snapshot: ProjectKnowledgeSnapshot = {
    id: stableSnapshotId(detail.project.path, capturedAt),
    projectPath: detail.project.path,
    projectName: detail.project.name,
    capturedAt,
    summary: buildSummary(detail),
    shippedFeatures: buildShippedFeatures(detail),
    currentArchitecture: buildArchitecture(detail),
    dataSources: await buildDataSources(options.dbPath, detail),
    testSignals: await readTestSignals(),
    knownGaps: buildKnownGaps(detail),
    nextMilestones: buildNextMilestones(detail)
  };
  await saveProjectKnowledgeSnapshot(options.dbPath, snapshot);
  return snapshot;
}

export async function getLatestProjectKnowledgeSnapshot(dbPath: string, projectName: string) {
  const db = await ensureDatabase(dbPath);
  try {
    const row = db
      .prepare(
        `SELECT id, project_path, project_name, captured_at, summary, shipped_features, current_architecture, data_sources, test_signals, known_gaps, next_milestones
         FROM project_knowledge_snapshots
         WHERE lower(project_name) = lower(?) OR lower(project_path) LIKE ?
         ORDER BY captured_at DESC
         LIMIT 1`
      )
      .get(projectName, `%${projectName.toLocaleLowerCase("zh-CN")}%`) as ProjectKnowledgeRow | undefined;
    return row ? mapRow(row) : null;
  } finally {
    db.close();
  }
}

export async function generateAllProjectKnowledgeSnapshots(options: {
  dbPath: string;
  obsidianVault: string;
  projectNames: string[];
  capturedAt?: string;
}) {
  const snapshots = await Promise.all(
    options.projectNames.map((projectName) =>
      generateProjectKnowledgeSnapshot({
        dbPath: options.dbPath,
        obsidianVault: options.obsidianVault,
        projectName,
        capturedAt: options.capturedAt
      })
    )
  );
  return snapshots.filter((snapshot): snapshot is ProjectKnowledgeSnapshot => Boolean(snapshot));
}

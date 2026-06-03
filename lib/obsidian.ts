import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getActionInbox } from "./action-inbox.ts";
import { getDailyActions } from "./daily-actions.ts";
import {
  getArchiveCandidateAudit,
  getCleanupRuns,
  getIgnoredConversations,
  getKeptArchiveCandidates,
  getMemoryQualityReport
} from "./memory-quality.ts";
import { getProjectDetail } from "./project-detail.ts";
import { getDailyReview } from "./review.ts";
import { getStrategyBoard } from "./strategy.ts";
import { getLatestProjectKnowledgeSnapshot } from "./project-knowledge.ts";
import type { ProjectKnowledgeSnapshot } from "./types.ts";

const generatedStart = "<!-- AUTO_GENERATED_START -->";
const generatedEnd = "<!-- AUTO_GENERATED_END -->";
const manualStart = "<!-- MANUAL_NOTES_START -->";
const manualEnd = "<!-- MANUAL_NOTES_END -->";

const actionStatusLabels = {
  open: "待处理",
  done: "已完成",
  skipped: "已跳过",
  snoozed: "已延后"
} as const;

const actionPriorityLabels = {
  high: "高",
  medium: "中",
  low: "低"
} as const;

function keepManualSection(existing: string | null) {
  if (!existing) {
    return `${manualStart}\n\n${manualEnd}`;
  }
  const start = existing.indexOf(manualStart);
  const end = existing.indexOf(manualEnd);
  if (start === -1 || end === -1 || end < start) {
    return `${manualStart}\n\n${manualEnd}`;
  }
  return existing.slice(start, end + manualEnd.length).trim();
}

async function renderGeneratedMarkdown(options: {
  dbPath: string;
  obsidianVault: string;
  review: Awaited<ReturnType<typeof getDailyReview>>;
}) {
  const review = options.review;
  const dailyActions = await getDailyActions({
    dbPath: options.dbPath,
    obsidianVault: options.obsidianVault,
    date: review.date,
    limit: 5
  });
  const actions = dailyActions.items
    .map(
      (item) =>
        `- [${actionStatusLabels[item.status]}][${actionPriorityLabels[item.priority]}] ${item.title}：${item.detail}（原因：${item.reason}；完成证据：${item.completionEvidence}）`
    )
    .join("\n") || "- 暂无行动建议。";
  const conversations = review.conversations
    .slice(0, 12)
    .map((item) => `- ${item.source === "codex" ? "Codex" : "Claude"}：${item.title}`)
    .join("\n") || "- 今天还没有采集到对话。";
  const projects = review.projects
    .slice(0, 10)
    .map((project) => `- ${project.name}：${project.techStack.join(", ")}，${project.hasGit ? "Git 项目" : "无 Git"}`)
    .join("\n") || "- 暂未识别本地项目。";
  const health = review.health
    .filter((check) => check.status !== "ok")
    .slice(0, 10)
    .map((check) => `- ${check.label}：${check.detail}`)
    .join("\n") || "- 没有需要立刻处理的环境提醒。";

  return [
    generatedStart,
    `# ${review.date} AI 工作流复盘`,
    "",
    `> ${review.summary}`,
    "",
    "## 今日行动",
    actions,
    "",
    "## 对话记忆",
    conversations,
    "",
    "## 项目进展",
    projects,
    "",
    "## 环境提醒",
    health,
    generatedEnd
  ].join("\n");
}

export async function exportDailyReviewToObsidian(options: {
  dbPath: string;
  obsidianVault: string;
  date: string;
}) {
  const dailyDir = path.join(options.obsidianVault, "Daily");
  await mkdir(dailyDir, { recursive: true });
  const target = path.join(dailyDir, `${options.date}.md`);
  const review = await getDailyReview(options.dbPath, options.date);
  let existing: string | null = null;
  try {
    existing = await readFile(target, "utf8");
  } catch {
    existing = null;
  }
  const generated = await renderGeneratedMarkdown({
    dbPath: options.dbPath,
    obsidianVault: options.obsidianVault,
    review
  });
  const next = `${generated}\n\n${keepManualSection(existing)}\n`;
  await writeFile(target, next, "utf8");
  return target;
}

function renderActionInboxMarkdown(inbox: Awaited<ReturnType<typeof getActionInbox>>, today: string) {
  const actions =
    inbox.groups
      .map((item) => {
        const project = item.projectName ? `（${item.projectName}）` : "";
        const repeated = item.count > 1 ? `，出现 ${item.count} 次：${item.dates.join(", ")}` : "";
        return `- ${item.latestDate} [${actionStatusLabels[item.status]}][${actionPriorityLabels[item.priority]}] ${item.title}${project}：${item.detail}${repeated}（原因：${item.reason}；完成证据：${item.completionEvidence}）`;
      })
      .join("\n") || "- 暂无未完成行动。";

  return [
    generatedStart,
    "# 行动收件箱",
    "",
    `> ${today}：当前 ${inbox.summary.groupedActions} 组未完成行动，来自 ${inbox.summary.totalActions} 条原始行动，${inbox.summary.snoozedActions} 个已延后，覆盖 ${inbox.summary.datesWithActions} 个复盘日。`,
    "",
    "## 未完成行动",
    actions,
    generatedEnd
  ].join("\n");
}

export async function exportActionInboxToObsidian(options: {
  dbPath: string;
  obsidianVault: string;
  today: string;
}) {
  await mkdir(options.obsidianVault, { recursive: true });
  const target = path.join(options.obsidianVault, "Actions.md");
  const inbox = await getActionInbox(options);
  let existing: string | null = null;
  try {
    existing = await readFile(target, "utf8");
  } catch {
    existing = null;
  }
  const next = `${renderActionInboxMarkdown(inbox, options.today)}\n\n${keepManualSection(existing)}\n`;
  await writeFile(target, next, "utf8");
  return target;
}

function renderMemoryQualityAuditMarkdown(options: {
  report: Awaited<ReturnType<typeof getMemoryQualityReport>>;
  archiveAudit: Awaited<ReturnType<typeof getArchiveCandidateAudit>>;
  keptArchiveCandidates: Awaited<ReturnType<typeof getKeptArchiveCandidates>>;
  ignoredConversations: Awaited<ReturnType<typeof getIgnoredConversations>>;
  cleanupRuns: Awaited<ReturnType<typeof getCleanupRuns>>;
  today: string;
}) {
  const archiveGroups =
    options.archiveAudit.groups
      .slice(0, 12)
      .map(
        (group) =>
          `- ${group.candidateKindLabel} / ${group.source} / ${group.summaryOrigin} / ${group.projectName}：${group.count} 条（${group.sampleTitles.join("、")}）`
      )
      .join("\n") || "- 暂无归档候选。";
  const kept =
    options.keptArchiveCandidates
      .slice(0, 20)
      .map((item) => `- ${item.source}：${item.title}${item.reason ? `（${item.reason}）` : ""}`)
      .join("\n") || "- 暂无已保留候选。";
  const ignored =
    options.ignoredConversations
      .slice(0, 20)
      .map((item) => `- ${item.source}：${item.title || item.id}（${item.reason}）`)
      .join("\n") || "- 暂无已忽略记忆。";
  const cleanupRuns =
    options.cleanupRuns
      .slice(0, 12)
      .map((run) => `- ${run.undoneAt ? "已撤销" : "可撤销"}：${run.filterLabel}，删除 ${run.deletedCount} 条，忽略 ${run.ignoredCount} 条`)
      .join("\n") || "- 暂无清理批次。";

  return [
    generatedStart,
    "# 记忆质量审计",
    "",
    `> ${options.today}：当前 ${options.report.summary.totalMemories} 条记忆，${options.report.summary.archiveCandidateMemories} 条归档候选，${options.keptArchiveCandidates.length} 条已保留候选，${options.ignoredConversations.length} 条已忽略记忆。`,
    "",
    "## 摘要质量",
    `- 健康：${options.report.summary.healthyMemories}`,
    `- 待补正文：${options.report.summary.needsBodyMemories}`,
    `- 异常：${options.report.summary.anomalyMemories}`,
    `- 正文摘要：${options.report.summary.threadBodySummaries}`,
    `- 标题兜底：${options.report.summary.titleFallbackSummaries}`,
    `- 人工摘要：${options.report.summary.manualSummaries}`,
    "",
    "## 归档候选",
    archiveGroups,
    "",
    "## 已保留候选",
    kept,
    "",
    "## 已忽略记忆",
    ignored,
    "",
    "## 清理批次",
    cleanupRuns,
    generatedEnd
  ].join("\n");
}

export async function exportMemoryQualityAuditToObsidian(options: {
  dbPath: string;
  obsidianVault: string;
  today: string;
}) {
  await mkdir(options.obsidianVault, { recursive: true });
  const target = path.join(options.obsidianVault, "Memory Quality.md");
  let existing: string | null = null;
  try {
    existing = await readFile(target, "utf8");
  } catch {
    existing = null;
  }
  const [report, archiveAudit, keptArchiveCandidates, ignoredConversations, cleanupRuns] = await Promise.all([
    getMemoryQualityReport(options.dbPath, { limit: Number.MAX_SAFE_INTEGER }),
    getArchiveCandidateAudit(options.dbPath),
    getKeptArchiveCandidates(options.dbPath),
    getIgnoredConversations(options.dbPath),
    getCleanupRuns(options.dbPath, { limit: 20 })
  ]);
  const generated = renderMemoryQualityAuditMarkdown({
    report,
    archiveAudit,
    keptArchiveCandidates,
    ignoredConversations,
    cleanupRuns,
    today: options.today
  });
  const next = `${generated}\n\n${keepManualSection(existing)}\n`;
  await writeFile(target, next, "utf8");
  return target;
}

function markdownList(items: string[]) {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- 暂无记录。";
}

function renderKnowledgeSnapshotMarkdown(snapshot: ProjectKnowledgeSnapshot | null) {
  if (!snapshot) {
    return [
      "## 阶段快照",
      "- 暂无阶段快照。下一次同步会生成项目知识库续写内容。"
    ].join("\n");
  }
  return [
    "## 阶段快照",
    `- 捕获时间：${snapshot.capturedAt}`,
    `- 摘要：${snapshot.summary}`,
    "",
    "### 已落地功能",
    markdownList(snapshot.shippedFeatures),
    "",
    "### 当前架构",
    markdownList(snapshot.currentArchitecture),
    "",
    "### 数据来源",
    markdownList(snapshot.dataSources),
    "",
    "### 测试信号",
    markdownList(snapshot.testSignals),
    "",
    "### 已知缺口",
    markdownList(snapshot.knownGaps),
    "",
    "### 下一阶段路线",
    markdownList(snapshot.nextMilestones)
  ].join("\n");
}

function renderStrategyBoardMarkdown(board: Awaited<ReturnType<typeof getStrategyBoard>>, today: string) {
  const projects =
    board.items
      .map((item) => {
        const actions = item.actions.map((action) => `${action.title}（${action.count} 次）`);
        return [
          `## ${item.project.name}`,
          "",
          `> ${item.project.path}`,
          "",
          `- 记忆：${item.memoryCount}`,
          `- 环境提醒：${item.warningCount}`,
          `- 阶段快照：${item.latestKnowledgeSnapshot ? item.latestKnowledgeSnapshot.summary : "暂无阶段快照。"}`,
          "",
          "### 目标",
          markdownList(item.goals),
          "",
          "### 决策",
          markdownList(item.decisions),
          "",
          "### 阻塞",
          markdownList(item.blockers.map((blocker) => blocker.text)),
          "",
          "### 未完成行动",
          markdownList(actions)
        ].join("\n");
      })
      .join("\n\n") || "## 暂无项目\n\n- 暂无战略数据。";

  return [
    generatedStart,
    "# 项目战略面板",
    "",
    `> ${today}：追踪 ${board.summary.totalProjects} 个项目，${board.summary.projectsWithGoals} 个有目标，${board.summary.projectsWithBlockers} 个有阻塞，${board.summary.projectsWithActions} 个有未完成行动。`,
    "",
    projects,
    generatedEnd
  ].join("\n");
}

export async function exportStrategyBoardToObsidian(options: {
  dbPath: string;
  obsidianVault: string;
  today: string;
}) {
  await mkdir(options.obsidianVault, { recursive: true });
  const target = path.join(options.obsidianVault, "Strategy.md");
  const board = await getStrategyBoard(options);
  let existing: string | null = null;
  try {
    existing = await readFile(target, "utf8");
  } catch {
    existing = null;
  }
  const next = `${renderStrategyBoardMarkdown(board, options.today)}\n\n${keepManualSection(existing)}\n`;
  await writeFile(target, next, "utf8");
  return target;
}

function safeProjectFileName(projectName: string) {
  return projectName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim() || "untitled-project";
}

function renderProjectArchiveMarkdown(
  detail: NonNullable<Awaited<ReturnType<typeof getProjectDetail>>>,
  knowledgeSnapshot: ProjectKnowledgeSnapshot | null
) {
  const tags = detail.relatedTags.length > 0 ? detail.relatedTags.map((tag) => `- ${tag}`).join("\n") : "- 暂无关联标签。";
  const scripts =
    detail.project.scripts.length > 0 ? detail.project.scripts.map((script) => `- ${script}`).join("\n") : "- 暂无入口脚本。";
  const memories =
    detail.memories
      .slice(0, 12)
      .map((item) => `- ${item.source === "codex" ? "Codex" : "Claude"}：${item.title}`)
      .join("\n") || "- 暂无关联记忆。";
  const health =
    detail.health
      .filter((check) => check.status !== "ok")
      .slice(0, 10)
      .map((check) => `- ${check.label}：${check.detail}${check.suggestion ? `（${check.suggestion}）` : ""}`)
      .join("\n") || "- 暂无阻塞性环境提醒。";
  const actions = detail.nextActions.map((action) => `- ${action}`).join("\n");

  return [
    generatedStart,
    `# ${detail.project.name} 项目档案`,
    "",
    `> ${detail.project.path}`,
    "",
    "## 项目概况",
    `- 技术栈：${detail.project.techStack.join(", ")}`,
    `- 仓库状态：${detail.project.hasGit ? "Git 项目" : "普通目录"}`,
    `- 最近更新：${detail.project.updatedAt}`,
    "",
    "## 常用入口",
    scripts,
    "",
    "## 关联标签",
    tags,
    "",
    "## 最近记忆",
    memories,
    "",
    renderKnowledgeSnapshotMarkdown(knowledgeSnapshot),
    "",
    "## 环境提醒",
    health,
    "",
    "## 下一步建议",
    actions,
    generatedEnd
  ].join("\n");
}

export async function exportProjectArchiveToObsidian(options: {
  dbPath: string;
  obsidianVault: string;
  projectName: string;
}) {
  const detail = await getProjectDetail(options.dbPath, options.projectName);
  if (!detail) return null;
  const knowledgeSnapshot = await getLatestProjectKnowledgeSnapshot(options.dbPath, detail.project.name);

  const projectsDir = path.join(options.obsidianVault, "Projects");
  await mkdir(projectsDir, { recursive: true });
  const target = path.join(projectsDir, `${safeProjectFileName(detail.project.name)}.md`);
  let existing: string | null = null;
  try {
    existing = await readFile(target, "utf8");
  } catch {
    existing = null;
  }
  const next = `${renderProjectArchiveMarkdown(detail, knowledgeSnapshot)}\n\n${keepManualSection(existing)}\n`;
  await writeFile(target, next, "utf8");
  return target;
}

import { getDailyActionStatuses, makeDailyActionId } from "./action-status.ts";
import { getBlockerBoard } from "./blockers.ts";
import { getProjectArchiveIndex } from "./project-archives.ts";
import { getDailyReview } from "./review.ts";
import { cleanActionText } from "./text.ts";
import type { DailyActionItem, DailyActionPriority, DailyActions, DailyActionKind } from "./types.ts";

type DraftDailyActionItem = {
  kind: DailyActionKind;
  priority: DailyActionPriority;
  title: string;
  detail: string;
  reason: string;
  completionEvidence: string;
  href: string;
  projectName: string | null;
};

export async function getDailyActions(options: {
  dbPath: string;
  obsidianVault: string;
  date: string;
  limit?: number;
}): Promise<DailyActions> {
  const limit = options.limit ?? 5;
  const [review, blockerBoard, archiveIndex] = await Promise.all([
    getDailyReview(options.dbPath, options.date),
    getBlockerBoard(options),
    getProjectArchiveIndex(options)
  ]);

  const actions: DraftDailyActionItem[] = [];

  const firstBlocker = blockerBoard.items[0];
  if (firstBlocker) {
    actions.push({
      kind: "blocker",
      priority: "high",
      title: `处理阻塞：${firstBlocker.projectName}`,
      detail: firstBlocker.text,
      reason: "阻塞会持续污染复盘和行动收件箱，应优先收口。",
      completionEvidence: "在项目页或 Obsidian 项目档案中补充处理结果，并将对应行动标记完成。",
      href: `/projects/${encodeURIComponent(firstBlocker.projectName)}`,
      projectName: firstBlocker.projectName
    });
  }

  const firstMissingArchive = archiveIndex.items.find((item) => !item.archiveExists);
  if (firstMissingArchive) {
    actions.push({
      kind: "archive",
      priority: "medium",
      title: `补齐项目档案：${firstMissingArchive.project.name}`,
      detail: "导出项目档案，让 Obsidian 开始承接长期上下文。",
      reason: "项目档案缺失会让目标、决策和阶段快照没有长期入口。",
      completionEvidence: "Obsidian Projects 目录出现对应项目档案，项目列表显示已导出。",
      href: `/projects/${encodeURIComponent(firstMissingArchive.project.name)}`,
      projectName: firstMissingArchive.project.name
    });
  }

  if (review.conversations.length > 0) {
    const firstConversation = review.conversations[0];
    actions.push({
      kind: "memory",
      priority: "medium",
      title: "回顾今日新增记忆",
      detail: `今日已有 ${review.conversations.length} 条对话，先从“${firstConversation.title}”开始收束。`,
      reason: "今日新增记忆需要被压缩成可复用上下文，避免只停留在线程标题里。",
      completionEvidence: "完成记忆搜索/质量页回顾，必要时补人工摘要或导出 Memory Quality 审计。",
      href: "/memories",
      projectName: null
    });
  }

  const firstWarning = review.health.find((check) => check.status !== "ok");
  if (firstWarning) {
    actions.push({
      kind: "health",
      priority: firstWarning.status === "fail" ? "high" : "medium",
      title: `处理环境提醒：${firstWarning.label}`,
      detail: firstWarning.detail,
      reason: "环境异常会反复变成构建或同步阻塞，需要进入可追踪行动。",
      completionEvidence: "重新采集后环境页显示该项恢复，或在项目阻塞中记录处理结论。",
      href: "/health",
      projectName: null
    });
  }

  for (const blocker of blockerBoard.items.slice(1, 3)) {
    actions.push({
      kind: "blocker",
      priority: "high",
      title: `处理阻塞：${blocker.projectName}`,
      detail: blocker.text,
      reason: "阻塞重复出现，优先级高于普通记忆回顾。",
      completionEvidence: "在项目页或 Obsidian 项目档案中补充处理结果，并将对应行动标记完成。",
      href: `/projects/${encodeURIComponent(blocker.projectName)}`,
      projectName: blocker.projectName
    });
  }

  for (const item of archiveIndex.items.filter((item) => !item.archiveExists && item.project.name !== firstMissingArchive?.project.name).slice(0, 2)) {
    actions.push({
      kind: "archive",
      priority: "medium",
      title: `补齐项目档案：${item.project.name}`,
      detail: "导出项目档案，让 Obsidian 开始承接长期上下文。",
      reason: "项目档案缺失会让项目上下文无法跨线程延续。",
      completionEvidence: "Obsidian Projects 目录出现对应项目档案，项目列表显示已导出。",
      href: `/projects/${encodeURIComponent(item.project.name)}`,
      projectName: item.project.name
    });
  }

  const statusById = await getDailyActionStatuses(options.dbPath, options.date);
  const items: DailyActionItem[] = actions.slice(0, limit).map((item) => {
    const cleanItem = {
      ...item,
      title: cleanActionText(item.title),
      detail: cleanActionText(item.detail)
    };
    const id = makeDailyActionId({
      date: options.date,
      kind: cleanItem.kind,
      title: cleanItem.title,
      detail: cleanItem.detail,
      projectName: cleanItem.projectName
    });

    return {
      id,
      ...cleanItem,
      reason: cleanActionText(cleanItem.reason),
      completionEvidence: cleanActionText(cleanItem.completionEvidence),
      status: statusById.get(id) ?? "open"
    };
  });

  return {
    items,
    summary: {
      totalActions: items.length,
      openActions: items.filter((item) => item.status === "open").length,
      date: options.date
    }
  };
}

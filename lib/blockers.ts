import { getProjectArchiveIndex } from "./project-archives.ts";
import { getProjectDetail } from "./project-detail.ts";
import { getHealthTrendReport } from "./health-trends.ts";
import type { BlockerBoard, BlockerBoardItem } from "./types.ts";

export async function getBlockerBoard(options: {
  dbPath: string;
  obsidianVault: string;
}): Promise<BlockerBoard> {
  const [index, healthTrend] = await Promise.all([getProjectArchiveIndex(options), getHealthTrendReport(options.dbPath, { limit: 5 })]);
  const trendByCheckId = new Map(healthTrend.items.map((item) => [item.checkId, item]));
  const items: BlockerBoardItem[] = [];

  for (const item of index.items) {
    for (const blocker of item.manualSections.blockers) {
      items.push({
        projectName: item.project.name,
        projectPath: item.project.path,
        archivePath: item.archivePath,
        source: "manual",
        text: blocker,
        status: "manual",
        suggestion: null
      });
    }

    const detail = await getProjectDetail(options.dbPath, item.project.name);
    if (!detail) continue;
    for (const check of detail.health.filter((check) => check.status !== "ok")) {
      const trend = trendByCheckId.get(check.id);
      const repeated = trend?.repeated ? `持续异常：${check.label}：${check.detail}` : `${check.label}：${check.detail}`;
      const suggestion = trend?.repeated
        ? `${trend.summary}${check.suggestion ? ` ${check.suggestion}` : ""}`
        : check.suggestion;
      items.push({
        projectName: item.project.name,
        projectPath: item.project.path,
        archivePath: item.archivePath,
        source: "health",
        checkId: check.id,
        text: repeated,
        status: check.status,
        suggestion,
        repeatCount: trend?.nonOkCount,
        trend: trend?.trend
      });
    }
  }

  return {
    items,
    summary: {
      totalBlockers: items.length,
      manualBlockers: items.filter((item) => item.source === "manual").length,
      healthBlockers: items.filter((item) => item.source === "health").length,
      projectsWithBlockers: new Set(items.map((item) => item.projectName)).size
    }
  };
}

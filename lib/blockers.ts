import { getProjectArchiveIndex } from "./project-archives.ts";
import { getProjectDetail } from "./project-detail.ts";
import type { BlockerBoard, BlockerBoardItem } from "./types.ts";

export async function getBlockerBoard(options: {
  dbPath: string;
  obsidianVault: string;
}): Promise<BlockerBoard> {
  const index = await getProjectArchiveIndex(options);
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
      items.push({
        projectName: item.project.name,
        projectPath: item.project.path,
        archivePath: item.archivePath,
        source: "health",
        text: `${check.label}：${check.detail}`,
        status: check.status,
        suggestion: check.suggestion
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

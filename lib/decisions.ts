import { getProjectArchiveIndex } from "./project-archives.ts";
import type { DecisionTimeline, DecisionTimelineItem } from "./types.ts";

export async function getDecisionTimeline(options: {
  dbPath: string;
  obsidianVault: string;
}): Promise<DecisionTimeline> {
  const index = await getProjectArchiveIndex(options);
  const items: DecisionTimelineItem[] = [];
  for (const item of index.items) {
    for (const decision of item.manualSections.decisions) {
      items.push({
        projectName: item.project.name,
        projectPath: item.project.path,
        archivePath: item.archivePath,
        text: decision
      });
    }
  }

  return {
    items,
    summary: {
      totalDecisions: items.length,
      projectsWithDecisions: new Set(items.map((item) => item.projectName)).size
    }
  };
}

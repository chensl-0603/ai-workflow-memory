import { getProjectArchiveIndex } from "./project-archives.ts";
import type { GoalBoard, GoalBoardItem } from "./types.ts";

export async function getGoalBoard(options: {
  dbPath: string;
  obsidianVault: string;
}): Promise<GoalBoard> {
  const index = await getProjectArchiveIndex(options);
  const items: GoalBoardItem[] = [];

  for (const item of index.items) {
    for (const goal of item.manualSections.goals) {
      items.push({
        projectName: item.project.name,
        projectPath: item.project.path,
        archivePath: item.archivePath,
        text: goal
      });
    }
  }

  return {
    items,
    summary: {
      totalGoals: items.length,
      projectsWithGoals: new Set(items.map((item) => item.projectName)).size
    }
  };
}

import { getActionInbox } from "./action-inbox.ts";
import { getBlockerBoard } from "./blockers.ts";
import { getProjectArchiveIndex } from "./project-archives.ts";
import type { ProjectStrategyItem, StrategyBoard } from "./types.ts";

export async function getStrategyBoard(options: {
  dbPath: string;
  obsidianVault: string;
  today: string;
}): Promise<StrategyBoard> {
  const [archiveIndex, blockerBoard, actionInbox] = await Promise.all([
    getProjectArchiveIndex(options),
    getBlockerBoard(options),
    getActionInbox(options)
  ]);

  const items: ProjectStrategyItem[] = archiveIndex.items.map((item) => {
    const projectName = item.project.name;
    return {
      project: item.project,
      archivePath: item.archivePath,
      latestKnowledgeSnapshot: item.latestKnowledgeSnapshot,
      goals: item.manualSections.goals,
      decisions: item.manualSections.decisions,
      blockers: blockerBoard.items.filter((blocker) => blocker.projectName === projectName),
      actions: actionInbox.groups.filter((action) => action.projectName === projectName),
      memoryCount: item.memoryCount,
      warningCount: item.warningCount
    };
  });

  return {
    items,
    summary: {
      totalProjects: items.length,
      projectsWithGoals: items.filter((item) => item.goals.length > 0).length,
      projectsWithDecisions: items.filter((item) => item.decisions.length > 0).length,
      projectsWithBlockers: items.filter((item) => item.blockers.length > 0).length,
      projectsWithActions: items.filter((item) => item.actions.length > 0).length
    }
  };
}

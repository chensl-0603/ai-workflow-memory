import type { ActionInbox, DailyActions, DailyFocus, DailyProjectProgress, DailyReview, DailyRepeatedBlocker } from "./types.ts";

function projectNameForPath(review: DailyReview, projectPath: string | null) {
  if (!projectPath) return "未关联项目";
  return review.projects.find((project) => project.path === projectPath)?.name ?? projectPath.split(/[\\/]/).filter(Boolean).at(-1) ?? projectPath;
}

function buildProjectProgress(review: DailyReview): DailyProjectProgress[] {
  const byProject = new Map<string, DailyProjectProgress>();

  for (const conversation of review.conversations) {
    const key = conversation.projectPath ?? "__unlinked__";
    const existing = byProject.get(key);
    if (!existing) {
      byProject.set(key, {
        projectName: projectNameForPath(review, conversation.projectPath),
        projectPath: conversation.projectPath,
        conversationCount: 1,
        latestTitle: conversation.title,
        latestAt: conversation.occurredAt,
        tags: [...conversation.tags]
      });
      continue;
    }

    existing.conversationCount += 1;
    for (const tag of conversation.tags) {
      if (!existing.tags.includes(tag)) existing.tags.push(tag);
    }
    if (conversation.occurredAt > existing.latestAt) {
      existing.latestAt = conversation.occurredAt;
      existing.latestTitle = conversation.title;
    }
  }

  return Array.from(byProject.values()).sort(
    (a, b) => b.conversationCount - a.conversationCount || b.latestAt.localeCompare(a.latestAt) || a.projectName.localeCompare(b.projectName)
  );
}

function buildRepeatedBlockers(inbox: ActionInbox): DailyRepeatedBlocker[] {
  return inbox.groups
    .filter((group) => group.kind === "blocker" && group.count > 1)
    .map((group) => ({
      key: group.key,
      projectName: group.projectName ?? "未关联项目",
      title: group.title,
      detail: group.detail,
      href: group.href,
      priority: group.priority,
      status: group.status,
      count: group.count,
      dates: group.dates,
      latestDate: group.latestDate,
      reason: group.reason
    }))
    .sort((a, b) => b.count - a.count || b.latestDate.localeCompare(a.latestDate) || a.projectName.localeCompare(b.projectName));
}

export function buildDailyFocus(input: { review: DailyReview; actions: DailyActions; inbox: ActionInbox }): DailyFocus {
  const projectProgress = buildProjectProgress(input.review).slice(0, 5);
  const repeatedBlockers = buildRepeatedBlockers(input.inbox).slice(0, 5);
  const openSteps = input.actions.items.filter((item) => item.status === "open");
  const nextSteps = (openSteps.length > 0 ? openSteps : input.actions.items.filter((item) => item.status === "snoozed")).slice(0, 3);
  const completedActions = input.actions.items.filter((item) => item.status === "done").slice(0, 5);

  return {
    projectProgress,
    repeatedBlockers,
    nextSteps,
    completedActions,
    summary: {
      progressedProjects: projectProgress.length,
      repeatedBlockers: repeatedBlockers.length,
      nextSteps: nextSteps.length,
      completedActions: completedActions.length
    }
  };
}

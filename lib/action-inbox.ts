import { getDailyActions } from "./daily-actions.ts";
import { getReviewHistory } from "./review-history.ts";
import type { ActionInbox, ActionInboxGroup, ActionInboxItem } from "./types.ts";

function makeGroupKey(item: ActionInboxItem) {
  return [item.kind, item.projectName ?? "", item.title, item.detail].join("\u001F");
}

function groupInboxItems(items: ActionInboxItem[]) {
  const groupsByKey = new Map<string, ActionInboxGroup>();

  for (const item of items) {
    const key = makeGroupKey(item);
    const existing = groupsByKey.get(key);
    if (!existing) {
      groupsByKey.set(key, {
        key,
        kind: item.kind,
        title: item.title,
        detail: item.detail,
        href: item.href,
        projectName: item.projectName,
        priority: item.priority,
        reason: item.reason,
        completionEvidence: item.completionEvidence,
        status: item.status,
        latestDate: item.date,
        dates: [item.date],
        count: 1
      });
      continue;
    }

    existing.count += 1;
    if (!existing.dates.includes(item.date)) {
      existing.dates.push(item.date);
      existing.dates.sort((a, b) => b.localeCompare(a));
    }
    if (item.date > existing.latestDate) {
      existing.latestDate = item.date;
      existing.href = item.href;
      existing.priority = item.priority;
      existing.reason = item.reason;
      existing.completionEvidence = item.completionEvidence;
    }
    if (item.status === "snoozed") {
      existing.status = "snoozed";
    }
  }

  return Array.from(groupsByKey.values()).sort((a, b) => b.latestDate.localeCompare(a.latestDate) || b.count - a.count || a.title.localeCompare(b.title));
}

export async function getActionInbox(options: {
  dbPath: string;
  obsidianVault: string;
  today: string;
}): Promise<ActionInbox> {
  const history = await getReviewHistory({
    dbPath: options.dbPath,
    obsidianVault: options.obsidianVault
  });
  const dates = Array.from(new Set([options.today, ...history.items.map((item) => item.date)])).sort((a, b) => b.localeCompare(a));

  const dailyActions = await Promise.all(
    dates.map(async (date) => ({
      date,
      actions: await getDailyActions({
        dbPath: options.dbPath,
        obsidianVault: options.obsidianVault,
        date,
        limit: 5
      })
    }))
  );
  const items: ActionInboxItem[] = dailyActions.flatMap(({ date, actions }) =>
    actions.items
      .filter((item) => item.status === "open" || item.status === "snoozed")
      .map((item) => ({
        date,
        ...item
      }))
  );
  const groups = groupInboxItems(items);

  return {
    items,
    groups,
    summary: {
      totalActions: items.length,
      groupedActions: groups.length,
      openActions: items.filter((item) => item.status === "open").length,
      snoozedActions: items.filter((item) => item.status === "snoozed").length,
      datesWithActions: new Set(items.map((item) => item.date)).size
    }
  };
}

import { getDailyActions } from "./daily-actions.ts";
import { getReviewHistory } from "./review-history.ts";
import type { ActionInbox, ActionInboxEscalation, ActionInboxGroup, ActionInboxItem } from "./types.ts";

function makeGroupKey(item: ActionInboxItem) {
  return [item.kind, item.projectName ?? "", item.title, item.detail].join("\u001F");
}

function buildEscalation(group: { kind: ActionInboxGroup["kind"]; count: number }): ActionInboxEscalation {
  if (group.count <= 1) return { level: null, reason: null };
  if (group.kind === "blocker") {
    return {
      level: "blocker",
      reason: `重复出现 ${group.count} 次，已自动提升为阻塞复盘焦点。`
    };
  }
  return {
    level: "risk",
    reason: `重复出现 ${group.count} 次，已自动提升为项目风险线索。`
  };
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
        evidence: item.evidence,
        evidenceSource: item.evidenceSource,
        completedAt: item.completedAt,
        escalation: { level: null, reason: null },
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
      existing.evidence = item.evidence;
      existing.evidenceSource = item.evidenceSource;
      existing.completedAt = item.completedAt;
    }
    if (item.status === "snoozed") {
      existing.status = "snoozed";
    }
  }

  return Array.from(groupsByKey.values())
    .map((group) => ({
      ...group,
      escalation: buildEscalation(group)
    }))
    .sort((a, b) => b.latestDate.localeCompare(a.latestDate) || b.count - a.count || a.title.localeCompare(b.title));
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
  const allItems: ActionInboxItem[] = dailyActions.flatMap(({ date, actions }) =>
    actions.items.map((item) => ({
      date,
      ...item
    }))
  );
  const items = allItems.filter((item) => item.status === "open" || item.status === "snoozed");
  const allCompletedItems = allItems.filter((item) => item.status === "done");
  const completedItems = allCompletedItems
    .sort((a, b) => b.date.localeCompare(a.date) || (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))
    .slice(0, 10);
  const groups = groupInboxItems(items);

  return {
    items,
    completedItems,
    groups,
    summary: {
      totalActions: items.length,
      groupedActions: groups.length,
      openActions: items.filter((item) => item.status === "open").length,
      snoozedActions: items.filter((item) => item.status === "snoozed").length,
      completedActions: allCompletedItems.length,
      datesWithActions: new Set(items.map((item) => item.date)).size
    }
  };
}

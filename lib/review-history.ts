import { readdir } from "node:fs/promises";
import path from "node:path";

import { getDailyActions } from "./daily-actions.ts";
import { ensureDatabase } from "./db.ts";
import type { ReviewHistory, ReviewHistoryItem } from "./types.ts";

type DateRow = {
  date: string;
  conversation_count: number;
};

const dailyFilePattern = /^\d{4}-\d{2}-\d{2}\.md$/;

async function listExportedDailyDates(obsidianVault: string) {
  const dailyDir = path.join(obsidianVault, "Daily");
  try {
    const entries = await readdir(dailyDir, { withFileTypes: true });
    return new Set(
      entries
        .filter((entry) => entry.isFile() && dailyFilePattern.test(entry.name))
        .map((entry) => entry.name.slice(0, 10))
    );
  } catch {
    return new Set<string>();
  }
}

async function listConversationDates(dbPath: string) {
  const db = await ensureDatabase(dbPath);
  try {
    return db
      .prepare(
        `SELECT substr(occurred_at, 1, 10) AS date, COUNT(*) AS conversation_count
         FROM conversations
         GROUP BY date
         ORDER BY date DESC`
      )
      .all() as DateRow[];
  } finally {
    db.close();
  }
}

export async function getReviewHistory(options: {
  dbPath: string;
  obsidianVault: string;
}): Promise<ReviewHistory> {
  const [conversationDates, exportedDates] = await Promise.all([listConversationDates(options.dbPath), listExportedDailyDates(options.obsidianVault)]);
  const conversationCountByDate = new Map(conversationDates.map((row) => [row.date, row.conversation_count]));
  const dates = Array.from(new Set([...conversationCountByDate.keys(), ...exportedDates])).sort((a, b) => b.localeCompare(a));

  const items: ReviewHistoryItem[] = await Promise.all(
    dates.map(async (date) => {
      const actions = await getDailyActions({
        dbPath: options.dbPath,
        obsidianVault: options.obsidianVault,
        date,
        limit: 5
      });
      const exportedPath = path.join(options.obsidianVault, "Daily", `${date}.md`);

      return {
        date,
        conversationCount: conversationCountByDate.get(date) ?? 0,
        actionCount: actions.items.length,
        exported: exportedDates.has(date),
        exportedPath
      };
    })
  );

  return {
    items,
    summary: {
      totalDays: items.length,
      exportedDays: items.filter((item) => item.exported).length,
      totalConversations: items.reduce((sum, item) => sum + item.conversationCount, 0),
      daysWithActions: items.filter((item) => item.actionCount > 0).length
    }
  };
}

import { createHash } from "node:crypto";

import { ensureDatabase } from "./db.ts";
import type { DailyActionKind, DailyActionStatus } from "./types.ts";

const validStatuses = new Set<DailyActionStatus>(["open", "done", "skipped", "snoozed"]);

type StatusRow = {
  action_id: string;
  status: string;
};

export function makeDailyActionId(input: {
  date: string;
  kind: DailyActionKind;
  title: string;
  detail: string;
  projectName: string | null;
}) {
  return createHash("sha256")
    .update([input.date, input.kind, input.projectName ?? "", input.title, input.detail].join("\u001F"))
    .digest("hex")
    .slice(0, 16);
}

export async function getDailyActionStatuses(dbPath: string, date: string) {
  const db = await ensureDatabase(dbPath);
  try {
    const rows = db
      .prepare(
        `SELECT action_id, status
         FROM daily_action_statuses
         WHERE date = ?`
      )
      .all(date) as StatusRow[];

    return new Map(
      rows
        .filter((row) => validStatuses.has(row.status as DailyActionStatus))
        .map((row) => [row.action_id, row.status as DailyActionStatus])
    );
  } finally {
    db.close();
  }
}

export async function setDailyActionStatus(options: {
  dbPath: string;
  date: string;
  actionId: string;
  status: DailyActionStatus;
}) {
  if (!validStatuses.has(options.status)) {
    throw new Error(`Unsupported action status: ${options.status}`);
  }

  const db = await ensureDatabase(options.dbPath);
  try {
    db.prepare(
      `INSERT INTO daily_action_statuses (date, action_id, status, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(date, action_id)
       DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`
    ).run(options.date, options.actionId, options.status, new Date().toISOString());
  } finally {
    db.close();
  }
}

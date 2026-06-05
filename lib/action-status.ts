import { createHash } from "node:crypto";

import { ensureDatabase } from "./db.ts";
import type { DailyActionEvidence, DailyActionEvidenceKind, DailyActionEvidenceStatus, DailyActionKind, DailyActionStatus } from "./types.ts";

const validStatuses = new Set<DailyActionStatus>(["open", "done", "skipped", "snoozed"]);
const validEvidenceKinds = new Set<DailyActionEvidenceKind>(["commit", "test", "sync", "manual"]);
const validEvidenceStatuses = new Set<DailyActionEvidenceStatus>(["ok", "fail", "unknown"]);

type StatusRow = {
  action_id: string;
  status: string;
  evidence: string;
  evidence_source: string | null;
  completed_at: string | null;
  updated_at: string;
};

export type DailyActionStatusRecord = {
  status: DailyActionStatus;
  evidence: DailyActionEvidence[];
  evidenceSource: string | null;
  completedAt: string | null;
  updatedAt: string;
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
        `SELECT action_id, status, evidence, evidence_source, completed_at, updated_at
         FROM daily_action_statuses
         WHERE date = ?`
      )
      .all(date) as StatusRow[];

    return new Map(
      rows
        .filter((row) => validStatuses.has(row.status as DailyActionStatus))
        .map((row): [string, DailyActionStatusRecord] => [
          row.action_id,
          {
            status: row.status as DailyActionStatus,
            evidence: parseEvidence(row.evidence, row.completed_at ?? row.updated_at),
            evidenceSource: row.evidence_source,
            completedAt: row.completed_at,
            updatedAt: row.updated_at
          }
        ])
    );
  } finally {
    db.close();
  }
}

function parseEvidence(value: string, fallbackRecordedAt: string): DailyActionEvidence[] {
  try {
    return normalizeEvidence(JSON.parse(value), fallbackRecordedAt);
  } catch {
    return [];
  }
}

function normalizeEvidence(value: unknown, fallbackRecordedAt: string): DailyActionEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const input = item as Partial<DailyActionEvidence>;
    if (!input.kind || !validEvidenceKinds.has(input.kind)) return [];
    const label = typeof input.label === "string" ? input.label.trim() : "";
    const detail = typeof input.detail === "string" ? input.detail.trim() : "";
    if (!label || !detail) return [];
    return [
      {
        kind: input.kind,
        label,
        detail,
        ref: typeof input.ref === "string" && input.ref.trim() ? input.ref.trim() : null,
        status: input.status && validEvidenceStatuses.has(input.status) ? input.status : "unknown",
        recordedAt: typeof input.recordedAt === "string" && input.recordedAt.trim() ? input.recordedAt.trim() : fallbackRecordedAt
      }
    ];
  });
}

export async function setDailyActionStatus(options: {
  dbPath: string;
  date: string;
  actionId: string;
  status: DailyActionStatus;
  evidence?: DailyActionEvidence[];
  evidenceSource?: string | null;
  completedAt?: string | null;
}) {
  if (!validStatuses.has(options.status)) {
    throw new Error(`Unsupported action status: ${options.status}`);
  }

  const db = await ensureDatabase(options.dbPath);
  const updatedAt = new Date().toISOString();
  const completedAt = options.status === "done" ? (options.completedAt ?? updatedAt) : null;
  const evidence = options.status === "done" ? normalizeEvidence(options.evidence ?? [], completedAt ?? updatedAt) : [];
  const evidenceSource = options.status === "done" ? (options.evidenceSource?.trim() || (evidence.length > 0 ? "manual" : null)) : null;
  try {
    db.prepare(
      `INSERT INTO daily_action_statuses (date, action_id, status, evidence, evidence_source, completed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(date, action_id)
       DO UPDATE SET status = excluded.status,
                     evidence = excluded.evidence,
                     evidence_source = excluded.evidence_source,
                     completed_at = excluded.completed_at,
                     updated_at = excluded.updated_at`
    ).run(options.date, options.actionId, options.status, JSON.stringify(evidence), evidenceSource, completedAt, updatedAt);
  } finally {
    db.close();
  }
}

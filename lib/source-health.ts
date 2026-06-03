import { stat } from "node:fs/promises";

import { ensureDatabase } from "./db.ts";
import { readJsonLines } from "./jsonl.ts";
import type { AppConfig, SourceHealthItem, SourceHealthReport, SourceKind } from "./types.ts";

type SourceHealthRow = {
  source: string;
  path: string;
  file_exists: number;
  item_count: number;
  latest_updated_at: string | null;
  checked_at: string;
  detail: string;
};

async function fileExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function latestIso(values: (string | number | null)[]) {
  const timestamps = values
    .map((value) => {
      if (typeof value === "number") return value;
      if (typeof value === "string") {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? null : parsed;
      }
      return null;
    })
    .filter((value): value is number => typeof value === "number");
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

function mapRow(row: SourceHealthRow): SourceHealthItem {
  return {
    source: row.source === "claude" ? "claude" : "codex",
    path: row.path,
    exists: Boolean(row.file_exists),
    itemCount: row.item_count,
    latestUpdatedAt: row.latest_updated_at,
    checkedAt: row.checked_at,
    detail: row.detail
  };
}

async function inspectCodexSource(path: string, checkedAt: string): Promise<SourceHealthItem> {
  const exists = await fileExists(path);
  const rows = exists ? await readJsonLines(path) : [];
  const latest = latestIso(rows.map((row) => (row as { updated_at?: unknown }).updated_at as string | null));
  return {
    source: "codex",
    path,
    exists,
    itemCount: rows.length,
    latestUpdatedAt: latest,
    checkedAt,
    detail: exists ? `Codex session_index.jsonl：${rows.length} 条索引。` : "Codex session_index.jsonl 不存在。"
  };
}

async function inspectClaudeSource(path: string, checkedAt: string): Promise<SourceHealthItem> {
  const exists = await fileExists(path);
  const rows = exists ? await readJsonLines(path) : [];
  const latest = latestIso(rows.map((row) => (row as { timestamp?: unknown }).timestamp as number | null));
  return {
    source: "claude",
    path,
    exists,
    itemCount: rows.length,
    latestUpdatedAt: latest,
    checkedAt,
    detail: exists ? `Claude history.jsonl：${rows.length} 条索引。` : "Claude history.jsonl 不存在。"
  };
}

export async function collectSourceHealth(config: Pick<AppConfig, "codexIndexPath" | "claudeHistoryPath">) {
  const checkedAt = new Date().toISOString();
  return Promise.all([
    inspectCodexSource(config.codexIndexPath, checkedAt),
    inspectClaudeSource(config.claudeHistoryPath, checkedAt)
  ]);
}

export async function recordSourceHealth(dbPath: string, items: SourceHealthItem[]) {
  const db = await ensureDatabase(dbPath);
  try {
    const upsert = db.prepare(
      `INSERT INTO source_health_checks
       (source, path, file_exists, item_count, latest_updated_at, checked_at, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(source) DO UPDATE SET
         path = excluded.path,
         file_exists = excluded.file_exists,
         item_count = excluded.item_count,
         latest_updated_at = excluded.latest_updated_at,
         checked_at = excluded.checked_at,
         detail = excluded.detail`
    );
    for (const item of items) {
      upsert.run(item.source, item.path, item.exists ? 1 : 0, item.itemCount, item.latestUpdatedAt, item.checkedAt, item.detail);
    }
  } finally {
    db.close();
  }
}

export async function getSourceHealthReport(dbPath: string): Promise<SourceHealthReport> {
  const db = await ensureDatabase(dbPath);
  try {
    const rows = db
      .prepare(
        `SELECT source, path, file_exists, item_count, latest_updated_at, checked_at, detail
         FROM source_health_checks
         ORDER BY source ASC`
      )
      .all() as SourceHealthRow[];
    const items = rows.map(mapRow);
    const now = Date.now();
    return {
      items,
      summary: {
        totalSources: items.length,
        missingSources: items.filter((item) => !item.exists).length,
        totalItems: items.reduce((total, item) => total + item.itemCount, 0),
        staleSources: items.filter((item) => !item.latestUpdatedAt || now - Date.parse(item.latestUpdatedAt) > 7 * 24 * 60 * 60 * 1000).length
      }
    };
  } finally {
    db.close();
  }
}

export function sourceHealthToCheck(item: SourceHealthItem) {
  const status = !item.exists || item.itemCount === 0 ? "warn" : "ok";
  const sourceLabel: Record<SourceKind, string> = {
    codex: "Codex",
    claude: "Claude"
  };
  return {
    id: `source:${item.source}`,
    label: `${sourceLabel[item.source]} 记忆索引`,
    status,
    detail: item.detail,
    suggestion: status === "ok" ? null : "检查本地历史索引是否仍存在；必要时先备份会话文件。"
  } as const;
}

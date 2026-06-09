import { ensureDatabase } from "./db.ts";
import type { HealthStatus, HealthTrendItem, HealthTrendKind, HealthTrendPoint, HealthTrendReport } from "./types.ts";

type HealthHistoryRow = {
  check_id: string;
  label: string;
  status: string;
  detail: string;
  suggestion: string | null;
  project_name: string | null;
  checked_at: string;
};

function normalizeLimit(limit: number | undefined) {
  if (!limit || !Number.isFinite(limit)) return 5;
  return Math.min(20, Math.max(1, Math.floor(limit)));
}

function toStatus(value: string): HealthStatus {
  return value === "fail" ? "fail" : value === "warn" ? "warn" : "ok";
}

function classifyTrend(recent: HealthTrendPoint[]): HealthTrendKind {
  const latest = recent[0];
  if (!latest || latest.status === "ok") {
    return recent.some((point) => point.status !== "ok") ? "recovered" : "ok";
  }
  const nonOkCount = recent.filter((point) => point.status !== "ok").length;
  return nonOkCount >= 2 ? "persistent" : "new";
}

function trendSummary(item: {
  label: string;
  projectName: string | null;
  recent: HealthTrendPoint[];
  nonOkCount: number;
  trend: HealthTrendKind;
}) {
  const scope = item.projectName ? `${item.projectName} ` : "";
  if (item.trend === "persistent") {
    return `${scope}${item.label} 连续 ${item.nonOkCount} 次处于异常状态，需要升级处理。`;
  }
  if (item.trend === "new") {
    return `${scope}${item.label} 最近一次出现异常，先观察下一次采集。`;
  }
  if (item.trend === "recovered") {
    return `${scope}${item.label} 最近一次已恢复，保留历史用于复盘。`;
  }
  return `${scope}${item.label} 最近 ${item.recent.length} 次均正常。`;
}

function mapRows(rows: HealthHistoryRow[], limit: number): HealthTrendItem[] {
  const grouped = new Map<string, HealthHistoryRow[]>();
  for (const row of rows) {
    const existing = grouped.get(row.check_id);
    if (existing) {
      existing.push(row);
    } else {
      grouped.set(row.check_id, [row]);
    }
  }

  return Array.from(grouped.entries()).map(([checkId, group]) => {
    const ordered = group.sort((a, b) => b.checked_at.localeCompare(a.checked_at)).slice(0, limit);
    const recent = ordered.map(
      (row): HealthTrendPoint => ({
        id: row.check_id,
        label: row.label,
        status: toStatus(row.status),
        detail: row.detail,
        suggestion: row.suggestion,
        checkedAt: row.checked_at
      })
    );
    const latest = recent[0];
    const nonOkCount = recent.filter((point) => point.status !== "ok").length;
    const trend = classifyTrend(recent);
    const repeated = trend === "persistent";
    const projectName = ordered[0]?.project_name ?? null;
    const label = latest?.label ?? ordered[0]?.label ?? checkId;

    return {
      checkId,
      label,
      projectName,
      latestStatus: latest?.status ?? "ok",
      latestDetail: latest?.detail ?? "",
      latestSuggestion: latest?.suggestion ?? null,
      latestCheckedAt: latest?.checkedAt ?? "",
      recent,
      nonOkCount,
      trend,
      repeated,
      summary: trendSummary({ label, projectName, recent, nonOkCount, trend })
    };
  });
}

export async function getHealthTrendReport(
  dbPath: string,
  options: {
    limit?: number;
    projectName?: string;
  } = {}
): Promise<HealthTrendReport> {
  const limit = normalizeLimit(options.limit);
  const db = await ensureDatabase(dbPath);
  try {
    const rows = options.projectName
      ? (db
          .prepare(
            `SELECT check_id, label, status, detail, suggestion, project_name, checked_at
             FROM health_check_history
             WHERE lower(project_name) = lower(?)
             ORDER BY checked_at DESC`
          )
          .all(options.projectName) as HealthHistoryRow[])
      : (db
          .prepare(
            `SELECT check_id, label, status, detail, suggestion, project_name, checked_at
             FROM health_check_history
             ORDER BY checked_at DESC`
          )
          .all() as HealthHistoryRow[]);
    const items = mapRows(rows, limit).sort(
      (a, b) =>
        Number(b.repeated) - Number(a.repeated) ||
        b.nonOkCount - a.nonOkCount ||
        b.latestCheckedAt.localeCompare(a.latestCheckedAt) ||
        a.label.localeCompare(b.label, "zh-CN")
    );
    const repeatedItems = items.filter((item) => item.repeated);

    return {
      items,
      summary: {
        totalChecks: items.length,
        repeatedAnomalies: repeatedItems.length,
        projectsWithRepeatedAnomalies: new Set(repeatedItems.map((item) => item.projectName).filter(Boolean)).size,
        limit
      }
    };
  } finally {
    db.close();
  }
}

import { stat } from "node:fs/promises";
import path from "node:path";

import { ensureDatabase } from "./db.ts";
import { exportActionInboxToObsidian, exportDailyReviewToObsidian, exportStrategyBoardToObsidian } from "./obsidian.ts";
import { exportAllProjectArchives, getProjectArchiveIndex } from "./project-archives.ts";
import type {
  SyncFailureCode,
  SyncFailureDiagnosis,
  SyncAudit,
  SyncRun,
  SyncRunStatus,
  SyncRunStatusFilter,
  SyncStage,
  SyncStatus,
  SyncTargetKind,
  SyncTargetStatus
} from "./types.ts";

type SyncRunRow = {
  id: string;
  date: string;
  status: string;
  project_count: number;
  message: string;
  failure_stage: string | null;
  ran_at: string;
};

const syncStageLabels: Record<SyncStage, string> = {
  daily: "Daily",
  actions: "Actions",
  strategy: "Strategy",
  projects: "项目档案"
};

function makeSyncRunId(ranAt: string) {
  return `sync:${ranAt}:${Math.random().toString(36).slice(2, 10)}`;
}

export function diagnoseSyncFailure(stage: SyncStage, error: unknown): SyncFailureDiagnosis {
  const message = String((error as Error).message ?? error);
  const code: SyncFailureCode = message.includes("EACCES") || message.includes("EPERM")
    ? "permission-denied"
    : message.includes("ENOTDIR") || message.includes("EISDIR")
      ? "vault-path-conflict"
      : message.includes("ENOENT")
        ? "path-not-found"
        : message.toLowerCase().includes("database is locked") || message.includes("SQLITE_BUSY")
          ? "database-busy"
          : "unknown";

  const stageLabel = syncStageLabels[stage];
  if (code === "permission-denied") {
    return {
      code,
      stage,
      title: `${stageLabel} 写入权限不足`,
      suggestion: "检查 Obsidian vault 和目标文件的写入权限，确认文件没有被其他程序锁定。"
    };
  }
  if (code === "vault-path-conflict") {
    return {
      code,
      stage,
      title: `Vault 路径不是可写文件夹`,
      suggestion: "确认 Obsidian vault 路径指向文件夹，不是同名文件或不可进入的路径。"
    };
  }
  if (code === "path-not-found") {
    return {
      code,
      stage,
      title: `${stageLabel} 目标路径不存在`,
      suggestion: "确认 Obsidian vault 所在磁盘和上级目录存在，然后重新同步。"
    };
  }
  if (code === "database-busy") {
    return {
      code,
      stage,
      title: "SQLite 正忙",
      suggestion: "稍等几秒后重新同步；如果持续出现，检查是否有另一个进程长时间占用数据库。"
    };
  }
  return {
    code,
    stage,
    title: `${stageLabel} 同步失败`,
    suggestion: "查看原始错误信息，确认路径、权限和本地数据库状态后重新同步。"
  };
}

function parseSyncStage(value: string | null): SyncStage {
  return value === "daily" || value === "actions" || value === "strategy" || value === "projects" ? value : "projects";
}

function normalizeLimit(limit: number | undefined) {
  if (!limit || !Number.isFinite(limit)) return 10;
  return Math.min(50, Math.max(1, Math.floor(limit)));
}

function normalizeStatusFilter(status: SyncRunStatusFilter | undefined): SyncRunStatusFilter {
  return status === "ok" || status === "fail" ? status : "all";
}

function mapSyncRunRow(row: SyncRunRow): SyncRun {
  return {
    id: row.id,
    date: row.date,
    status: row.status === "fail" ? "fail" : "ok",
    projectCount: row.project_count,
    message: row.message,
    diagnosis: row.status === "fail" ? diagnoseSyncFailure(parseSyncStage(row.failure_stage), new Error(row.message)) : null,
    ranAt: row.ran_at
  };
}

async function recordSyncRun(options: {
  dbPath: string;
  date: string;
  status: SyncRunStatus;
  projectCount: number;
  message: string;
  failureStage?: SyncStage | null;
  ranAt?: string;
}) {
  const db = await ensureDatabase(options.dbPath);
  const ranAt = options.ranAt ?? new Date().toISOString();
  try {
    db.prepare(
      `INSERT INTO sync_runs (id, date, status, project_count, message, failure_stage, ran_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(makeSyncRunId(ranAt), options.date, options.status, options.projectCount, options.message, options.failureStage ?? null, ranAt);
  } finally {
    db.close();
  }
}

export async function syncObsidian(options: {
  dbPath: string;
  obsidianVault: string;
  today: string;
}) {
  let projectCount = 0;
  let stage: SyncStage = "daily";
  try {
    const dailyPath = await exportDailyReviewToObsidian({
      dbPath: options.dbPath,
      obsidianVault: options.obsidianVault,
      date: options.today
    });
    stage = "actions";
    const actionsPath = await exportActionInboxToObsidian(options);
    stage = "strategy";
    const strategyPath = await exportStrategyBoardToObsidian(options);
    stage = "projects";
    const projects = await exportAllProjectArchives({
      dbPath: options.dbPath,
      obsidianVault: options.obsidianVault
    });
    projectCount = projects.exported;

    await recordSyncRun({
      dbPath: options.dbPath,
      date: options.today,
      status: "ok",
      projectCount,
      message: `Daily、Actions、Strategy、${projects.exported} 个项目档案和 ${projects.snapshots} 个阶段快照已同步。`
    });

    return {
      date: options.today,
      dailyPath,
      actionsPath,
      strategyPath,
      projects
    };
  } catch (error) {
    await recordSyncRun({
      dbPath: options.dbPath,
      date: options.today,
      status: "fail",
      projectCount,
      message: String((error as Error).message),
      failureStage: stage
    });
    throw error;
  }
}

export async function getSyncAudit(options: {
  dbPath: string;
  status?: SyncRunStatusFilter;
  limit?: number;
}): Promise<SyncAudit> {
  const db = await ensureDatabase(options.dbPath);
  const limit = normalizeLimit(options.limit);
  const statusFilter = normalizeStatusFilter(options.status);
  const where = statusFilter === "all" ? "" : "WHERE status = ?";
  const queryParams = statusFilter === "all" ? [] : [statusFilter];
  try {
    const rows = db
      .prepare(
        `SELECT id, date, status, project_count, message, failure_stage, ran_at
         FROM sync_runs
         ${where}
         ORDER BY ran_at DESC
         LIMIT ?`
      )
      .all(...queryParams, limit) as SyncRunRow[];
    const statsRows = db.prepare("SELECT status, COUNT(*) AS count FROM sync_runs GROUP BY status").all() as { status: string; count: number }[];
    const latest = db.prepare("SELECT status FROM sync_runs ORDER BY ran_at DESC LIMIT 1").get() as { status: string } | undefined;
    const failureRows = db
      .prepare("SELECT message, failure_stage FROM sync_runs WHERE status = 'fail'")
      .all() as Pick<SyncRunRow, "message" | "failure_stage">[];
    const failureCounts = new Map<SyncFailureCode, number>();
    for (const row of failureRows) {
      const code = diagnoseSyncFailure(parseSyncStage(row.failure_stage), new Error(row.message)).code;
      failureCounts.set(code, (failureCounts.get(code) ?? 0) + 1);
    }
    const okRuns = statsRows.find((row) => row.status === "ok")?.count ?? 0;
    const failedRuns = statsRows.find((row) => row.status === "fail")?.count ?? 0;
    const items = rows.map(mapSyncRunRow);

    return {
      items,
      summary: {
        totalRuns: okRuns + failedRuns,
        okRuns,
        failedRuns,
        shownRuns: items.length,
        latestStatus: latest ? (latest.status === "fail" ? "fail" : "ok") : null,
        statusFilter,
        limit,
        failureCodes: Array.from(failureCounts.entries())
          .map(([code, count]) => ({ code, count }))
          .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
      }
    };
  } finally {
    db.close();
  }
}

export async function getRecentSyncRuns(dbPath: string, limit = 5): Promise<SyncRun[]> {
  const audit = await getSyncAudit({ dbPath, limit });
  return audit.items;
}

async function getFileStatus(target: {
  kind: SyncTargetKind;
  label: string;
  path: string;
}): Promise<SyncTargetStatus> {
  try {
    const file = await stat(target.path);
    return {
      ...target,
      exists: true,
      sizeBytes: file.size,
      updatedAt: file.mtime.toISOString()
    };
  } catch {
    return {
      ...target,
      exists: false,
      sizeBytes: 0,
      updatedAt: null
    };
  }
}

export async function getSyncStatus(options: {
  dbPath: string;
  obsidianVault: string;
  today: string;
}): Promise<SyncStatus> {
  const archiveIndex = await getProjectArchiveIndex(options);
  const targets = await Promise.all(
    [
      {
        kind: "daily" as const,
        label: "每日复盘",
        path: path.join(options.obsidianVault, "Daily", `${options.today}.md`)
      },
      {
        kind: "actions" as const,
        label: "行动收件箱",
        path: path.join(options.obsidianVault, "Actions.md")
      },
      {
        kind: "strategy" as const,
        label: "项目战略面板",
        path: path.join(options.obsidianVault, "Strategy.md")
      },
      ...archiveIndex.items.map((item) => ({
        kind: "project" as const,
        label: item.project.name,
        path: item.archivePath
      }))
    ].map(getFileStatus)
  );

  return {
    date: options.today,
    targets,
    summary: {
      totalTargets: targets.length,
      existingTargets: targets.filter((target) => target.exists).length,
      missingTargets: targets.filter((target) => !target.exists).length,
      totalSizeBytes: targets.reduce((total, target) => total + target.sizeBytes, 0)
    }
  };
}

"use client";

import { useState } from "react";

import { getFailedSyncControlState, getInitialSyncControlState, getRetryableSyncRunId } from "../../lib/sync-console-state.ts";
import type { SyncAudit, SyncRunStatusFilter, SyncStatus } from "../../lib/types.ts";

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}

const statusOptions: { label: string; value: SyncRunStatusFilter }[] = [
  { label: "全部", value: "all" },
  { label: "成功", value: "ok" },
  { label: "失败", value: "fail" }
];

const limitOptions = [5, 10, 20];

export function SyncConsole({ today, initialAudit, initialStatus }: { today: string; initialAudit: SyncAudit; initialStatus: SyncStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [audit, setAudit] = useState(initialAudit);
  const [state, setState] = useState(getInitialSyncControlState(initialAudit.items));
  const [busy, setBusy] = useState(false);
  const [runFilter, setRunFilter] = useState<SyncRunStatusFilter>(initialAudit.summary.statusFilter);
  const [runLimit, setRunLimit] = useState(initialAudit.summary.limit);
  const runs = audit.items;
  const retryableRunId = getRetryableSyncRunId(runs);

  async function refreshStatus(nextFilter = runFilter, nextLimit = runLimit) {
    const query = new URLSearchParams({
      today,
      syncStatus: nextFilter,
      limit: String(nextLimit)
    });
    const response = await fetch(`/api/sync/status?${query.toString()}`);
    const data = (await response.json()) as { status?: SyncStatus; audit?: SyncAudit; error?: string };
    if (!response.ok) throw new Error(data.error ?? "状态刷新失败");
    if (data.status) setStatus(data.status);
    if (data.audit) setAudit(data.audit);
  }

  async function changeFilter(nextFilter: SyncRunStatusFilter) {
    setRunFilter(nextFilter);
    await refreshStatus(nextFilter, runLimit);
  }

  async function changeLimit(nextLimit: number) {
    setRunLimit(nextLimit);
    await refreshStatus(runFilter, nextLimit);
  }

  async function sync() {
    setBusy(true);
    setState({ label: "正在同步", detail: "生成 Obsidian 自动区。", tone: "idle" });
    try {
      const response = await fetch("/api/sync/obsidian", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ today })
      });
      const data = (await response.json()) as { projects?: { exported?: number; snapshots?: number }; error?: string };
      if (!response.ok) throw new Error(data.error ?? "同步失败");
      await refreshStatus();
      setState({
        label: "同步完成",
        detail: `已同步 Daily、Actions、Strategy、${data.projects?.exported ?? 0} 个项目档案，并刷新 ${data.projects?.snapshots ?? 0} 个阶段快照。`,
        tone: "ok"
      });
    } catch (error) {
      const message = String((error as Error).message);
      try {
        await refreshStatus();
      } catch {
        // The button state still carries the sync failure when status refresh also fails.
      }
      setState(getFailedSyncControlState(message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="panel sync-panel">
        <div>
          <span className="muted-label">目标日期</span>
          <strong>{today}</strong>
        </div>
        <div>
          <span className="muted-label">Obsidian 状态</span>
          <strong>
            {status.summary.existingTargets}/{status.summary.totalTargets} 已生成
          </strong>
        </div>
        <div className="sync-command">
          <button className={`project-export-button ${state.tone}`} type="button" onClick={sync} disabled={busy}>
            {state.label}
          </button>
          <p>{state.detail}</p>
        </div>
      </section>

      <section className="project-index-summary" aria-label="同步状态概况">
        <div>
          <span>{status.summary.totalTargets}</span>
          <p>目标文件</p>
        </div>
        <div>
          <span>{status.summary.existingTargets}</span>
          <p>已生成</p>
        </div>
        <div>
          <span>{status.summary.missingTargets}</span>
          <p>缺失</p>
        </div>
        <div>
          <span>{formatBytes(status.summary.totalSizeBytes)}</span>
          <p>总大小</p>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>同步审计</h2>
          <div className="sync-audit-controls" aria-label="同步日志筛选">
            <div>
              {statusOptions.map((option) => (
                <button
                  key={option.value}
                  className={runFilter === option.value ? "active" : ""}
                  type="button"
                  onClick={() => void changeFilter(option.value)}
                  disabled={busy}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div>
              {limitOptions.map((option) => (
                <button
                  key={option}
                  className={runLimit === option ? "active" : ""}
                  type="button"
                  onClick={() => void changeLimit(option)}
                  disabled={busy}
                >
                  {option} 条
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="sync-audit-summary" aria-label="同步日志统计">
          <div>
            <span>{audit.summary.totalRuns}</span>
            <p>总次数</p>
          </div>
          <div>
            <span>{audit.summary.okRuns}</span>
            <p>成功</p>
          </div>
          <div>
            <span>{audit.summary.failedRuns}</span>
            <p>失败</p>
          </div>
          <div>
            <span>{audit.summary.shownRuns}</span>
            <p>当前显示</p>
          </div>
        </div>
        {audit.summary.failureCodes.length > 0 ? (
          <div className="sync-failure-codes" aria-label="失败类型统计">
            {audit.summary.failureCodes.map((item) => (
              <span key={item.code}>
                {item.code} · {item.count}
              </span>
            ))}
          </div>
        ) : null}
        {runs.length === 0 ? (
          <div className="empty-state">
            <strong>暂无同步记录</strong>
            <p>调整筛选或点击同步后，这里会记录最近的同步时间、目标日期和结果。</p>
          </div>
        ) : (
          <div className="sync-run-list">
            {runs.map((run) => (
              <article key={run.id} className={run.status}>
                <div>
                  <span>{run.status === "ok" ? "成功" : "失败"}</span>
                  <strong>{run.date}</strong>
                  {run.diagnosis ? (
                    <div className="sync-diagnosis">
                      <strong>{run.diagnosis.title}</strong>
                      <p>{run.diagnosis.suggestion}</p>
                    </div>
                  ) : null}
                  <p>{run.message}</p>
                  {run.snapshotSummary ? (
                    <p>
                      快照：同步前 {run.snapshotSummary.beforeTargets} 项，同步后 {run.snapshotSummary.afterTargets} 项
                      {run.snapshotSummary.failureTargets > 0 ? `，失败时 ${run.snapshotSummary.failureTargets} 项` : ""}，变化{" "}
                      {run.snapshotSummary.changedTargets} 项。
                    </p>
                  ) : null}
                </div>
                <div className="sync-run-meta">
                  <strong>{run.projectCount} 项目</strong>
                  <p>{run.ranAt}</p>
                  {retryableRunId === run.id ? (
                    <button className="sync-retry-button" type="button" onClick={sync} disabled={busy}>
                      重新同步
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>目标文件</h2>
        </div>
        <div className="sync-status-list">
          {status.targets.map((target) => (
            <article key={`${target.kind}-${target.path}`} className={target.exists ? "ready" : "missing"}>
              <div>
                <span>{target.kind}</span>
                <strong>{target.label}</strong>
                <p>{target.path}</p>
              </div>
              <div>
                <strong>{target.exists ? "已生成" : "未生成"}</strong>
                <p>{target.exists ? `${formatBytes(target.sizeBytes)} · ${target.updatedAt}` : "等待同步"}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

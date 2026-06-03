"use client";

import { useState } from "react";

import type { DailyActionStatus } from "../lib/types.ts";

type ActionStatusControlsProps = {
  date: string;
  actionId: string;
  initialStatus: DailyActionStatus;
};

const statusLabel: Record<DailyActionStatus, string> = {
  open: "待处理",
  done: "已完成",
  skipped: "已跳过",
  snoozed: "已延后"
};

export function ActionStatusControls({ date, actionId, initialStatus }: ActionStatusControlsProps) {
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);

  async function updateStatus(nextStatus: DailyActionStatus) {
    setBusy(true);
    try {
      const response = await fetch("/api/actions/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, actionId, status: nextStatus })
      });
      const data = (await response.json()) as { status?: DailyActionStatus; error?: string };
      if (!response.ok) throw new Error(data.error ?? "更新失败");
      setStatus(data.status ?? nextStatus);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="action-status-controls" aria-label="行动状态">
      <span className={`action-status ${status}`}>{statusLabel[status]}</span>
      <button type="button" onClick={() => updateStatus("done")} disabled={busy || status === "done"}>
        完成
      </button>
      <button type="button" onClick={() => updateStatus("snoozed")} disabled={busy || status === "snoozed"}>
        延后
      </button>
      <button type="button" onClick={() => updateStatus("skipped")} disabled={busy || status === "skipped"}>
        跳过
      </button>
    </div>
  );
}

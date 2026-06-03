"use client";

import { useState } from "react";

type UndoState = {
  label: string;
  detail: string;
  tone: "idle" | "ok" | "warn";
};

export function UndoLatestCleanupButton({ disabled }: { disabled: boolean }) {
  const [state, setState] = useState<UndoState>({
    label: "撤销最近清理",
    detail: disabled ? "当前没有可撤销的清理批次。" : "只恢复最近一次清理写入的忽略记录。",
    tone: "idle"
  });
  const [busy, setBusy] = useState(false);

  async function undo() {
    setBusy(true);
    setState({ label: "正在撤销", detail: "正在移除最近批次的忽略记录。", tone: "idle" });
    try {
      const response = await fetch("/api/memories/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "latest-cleanup" })
      });
      const data = (await response.json()) as { restoredConversations?: number; cleanupRunId?: string | null; error?: string };
      if (!response.ok) throw new Error(data.error ?? "撤销失败");
      setState({
        label: `已撤销 ${data.restoredConversations ?? 0} 条`,
        detail: data.cleanupRunId ? "最近清理批次已撤销。运行采集后，原始历史会重新进入记忆流。" : "没有可撤销的清理批次。",
        tone: "ok"
      });
      window.setTimeout(() => window.location.reload(), 650);
    } catch (error) {
      setState({ label: "重试撤销", detail: String((error as Error).message), tone: "warn" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="quality-cleanup-command">
      <button className={`project-export-button ${state.tone}`} type="button" onClick={undo} disabled={busy || disabled} title={state.detail}>
        {state.label}
      </button>
      <p aria-live="polite">{state.detail}</p>
    </div>
  );
}

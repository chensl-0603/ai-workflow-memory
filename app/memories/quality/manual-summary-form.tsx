"use client";

import { useState } from "react";

export function ManualSummaryForm({ id, initialSummary }: { id: string; initialSummary: string }) {
  const [summary, setSummary] = useState(initialSummary);
  const [state, setState] = useState({ label: "保存", detail: "人工摘要会在后续采集中保留。", tone: "idle" as "idle" | "ok" | "warn" });
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setState({ label: "保存中", detail: "正在写入人工摘要。", tone: "idle" });
    try {
      const response = await fetch("/api/memories/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, summary })
      });
      const data = (await response.json()) as { updated?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error ?? "保存失败");
      setState({
        label: data.updated ? "已保存" : "未更新",
        detail: data.updated ? "已标记为人工摘要。刷新后会进入正文摘要之外的人工统计。" : "没有找到这条记忆。",
        tone: data.updated ? "ok" : "warn"
      });
      if (data.updated) window.setTimeout(() => window.location.reload(), 650);
    } catch (error) {
      setState({ label: "重试", detail: String((error as Error).message), tone: "warn" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="manual-summary-form">
      <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={4} aria-label="人工摘要" />
      <div>
        <button className={`project-export-button ${state.tone}`} type="button" onClick={save} disabled={busy || summary.trim().length === 0}>
          {state.label}
        </button>
        <p aria-live="polite">{state.detail}</p>
      </div>
    </div>
  );
}

export function ResetManualSummaryButton({ id }: { id: string }) {
  const [state, setState] = useState({ label: "交回采集器", detail: "撤回人工摘要后，下次采集会重新生成。", tone: "idle" as "idle" | "ok" | "warn" });
  const [busy, setBusy] = useState(false);

  async function reset() {
    setBusy(true);
    setState({ label: "处理中", detail: "正在撤回人工摘要。", tone: "idle" });
    try {
      const response = await fetch("/api/memories/summary", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const data = (await response.json()) as { updated?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error ?? "撤回失败");
      setState({
        label: data.updated ? "已交回" : "未更新",
        detail: data.updated ? "已恢复为标题兜底，下一次采集会尝试接管摘要。" : "没有找到可撤回的人工摘要。",
        tone: data.updated ? "ok" : "warn"
      });
      if (data.updated) window.setTimeout(() => window.location.reload(), 650);
    } catch (error) {
      setState({ label: "重试", detail: String((error as Error).message), tone: "warn" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="manual-summary-reset">
      <button className={`project-export-button ${state.tone}`} type="button" onClick={reset} disabled={busy}>
        {state.label}
      </button>
      <p aria-live="polite">{state.detail}</p>
    </div>
  );
}

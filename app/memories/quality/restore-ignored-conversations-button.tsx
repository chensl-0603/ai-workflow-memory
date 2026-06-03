"use client";

import { useState } from "react";

type RestoreState = {
  label: string;
  detail: string;
  tone: "idle" | "ok" | "warn";
};

export function RestoreIgnoredConversationsButton({ count }: { count: number }) {
  const [state, setState] = useState<RestoreState>({
    label: "恢复全部",
    detail: count > 0 ? "移除忽略记录，下次采集会从原始历史重新导入。" : "当前没有已忽略记忆。",
    tone: "idle"
  });
  const [busy, setBusy] = useState(false);

  async function restore() {
    setBusy(true);
    setState({ label: "正在恢复", detail: "移除忽略记录。", tone: "idle" });
    try {
      const response = await fetch("/api/memories/restore", { method: "POST" });
      const data = (await response.json()) as { restoredConversations?: number; error?: string };
      if (!response.ok) throw new Error(data.error ?? "恢复失败");
      setState({
        label: `已恢复 ${data.restoredConversations ?? 0} 条`,
        detail: "已移除忽略记录。运行采集后，原始历史会重新进入记忆流。",
        tone: "ok"
      });
      window.setTimeout(() => window.location.reload(), 650);
    } catch (error) {
      setState({ label: "重试恢复", detail: String((error as Error).message), tone: "warn" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="quality-cleanup-command">
      <button className={`project-export-button ${state.tone}`} type="button" onClick={restore} disabled={busy || count === 0}>
        {state.label}
      </button>
      <p aria-live="polite">{state.detail}</p>
    </div>
  );
}

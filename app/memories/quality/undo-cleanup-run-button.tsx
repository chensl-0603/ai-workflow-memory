"use client";

import { useState } from "react";

type UndoState = {
  label: string;
  tone: "idle" | "ok" | "warn";
};

export function UndoCleanupRunButton({ cleanupRunId, disabled }: { cleanupRunId: string; disabled: boolean }) {
  const [state, setState] = useState<UndoState>({
    label: disabled ? "已撤销" : "撤销",
    tone: "idle"
  });
  const [busy, setBusy] = useState(false);

  async function undo() {
    setBusy(true);
    setState({ label: "撤销中", tone: "idle" });
    try {
      const response = await fetch("/api/memories/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cleanupRunId })
      });
      const data = (await response.json()) as { restoredConversations?: number; error?: string };
      if (!response.ok) throw new Error(data.error ?? "撤销失败");
      setState({ label: `已撤销 ${data.restoredConversations ?? 0}`, tone: "ok" });
      window.setTimeout(() => window.location.reload(), 650);
    } catch {
      setState({ label: "重试", tone: "warn" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className={`sync-retry-button ${state.tone}`} type="button" onClick={undo} disabled={busy || disabled}>
      {state.label}
    </button>
  );
}

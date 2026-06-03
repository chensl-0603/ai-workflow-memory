"use client";

import { useState } from "react";

type ExportState = {
  label: string;
  tone: "idle" | "ok" | "warn";
};

export function ExportStrategyButton({ today }: { today: string }) {
  const [state, setState] = useState<ExportState>({ label: "导出战略", tone: "idle" });
  const [busy, setBusy] = useState(false);

  async function exportStrategy() {
    setBusy(true);
    setState({ label: "正在导出", tone: "idle" });
    try {
      const response = await fetch("/api/export/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ today })
      });
      const data = (await response.json()) as { path?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "导出失败");
      setState({ label: data.path ?? "已导出", tone: "ok" });
    } catch (error) {
      setState({ label: String((error as Error).message), tone: "warn" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className={`project-export-button ${state.tone}`} type="button" onClick={exportStrategy} disabled={busy} title={state.label}>
      {state.label}
    </button>
  );
}

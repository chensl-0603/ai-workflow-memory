"use client";

import { useState } from "react";

type ExportState = {
  label: string;
  tone: "idle" | "ok" | "warn";
};

export function ExportAllProjectsButton() {
  const [state, setState] = useState<ExportState>({ label: "全部导出", tone: "idle" });
  const [busy, setBusy] = useState(false);

  async function exportAll() {
    setBusy(true);
    setState({ label: "正在导出", tone: "idle" });
    try {
      const response = await fetch("/api/export/projects", { method: "POST" });
      const data = (await response.json()) as { exported?: number; error?: string };
      if (!response.ok) throw new Error(data.error ?? "导出失败");
      setState({ label: `已导出 ${data.exported ?? 0} 个`, tone: "ok" });
      window.setTimeout(() => window.location.reload(), 650);
    } catch (error) {
      setState({ label: String((error as Error).message), tone: "warn" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className={`project-export-button ${state.tone}`} type="button" onClick={exportAll} disabled={busy} title={state.label}>
      {state.label}
    </button>
  );
}

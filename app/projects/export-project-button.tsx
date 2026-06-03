"use client";

import { useState } from "react";

type ExportState = {
  label: string;
  tone: "idle" | "ok" | "warn";
};

export function ExportProjectButton({ projectName }: { projectName: string }) {
  const [state, setState] = useState<ExportState>({ label: "导出项目档案", tone: "idle" });
  const [busy, setBusy] = useState(false);

  async function exportProject() {
    setBusy(true);
    setState({ label: "正在导出", tone: "idle" });
    try {
      const response = await fetch("/api/export/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName })
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
    <button className={`project-export-button ${state.tone}`} type="button" onClick={exportProject} disabled={busy} title={state.label}>
      {state.label}
    </button>
  );
}

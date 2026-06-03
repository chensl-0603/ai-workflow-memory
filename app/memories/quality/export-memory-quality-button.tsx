"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ExportState = {
  label: string;
  tone: "idle" | "ok" | "warn";
};

export function ExportMemoryQualityButton() {
  const router = useRouter();
  const [state, setState] = useState<ExportState>({ label: "导出审计", tone: "idle" });
  const [busy, setBusy] = useState(false);

  async function exportAudit() {
    setBusy(true);
    setState({ label: "正在导出", tone: "idle" });
    try {
      const response = await fetch("/api/export/memory-quality", { method: "POST" });
      const data = (await response.json()) as { path?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "导出失败");
      setState({ label: data.path ?? "已导出", tone: "ok" });
      router.refresh();
    } catch (error) {
      setState({ label: String((error as Error).message), tone: "warn" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className={`project-export-button ${state.tone}`} type="button" onClick={exportAudit} disabled={busy} title={state.label}>
      {state.label}
    </button>
  );
}

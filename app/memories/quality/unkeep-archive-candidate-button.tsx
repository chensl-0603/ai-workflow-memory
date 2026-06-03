"use client";

import { useState } from "react";

export function UnkeepArchiveCandidateButton({ id }: { id: string }) {
  const [label, setLabel] = useState("取消保留");
  const [busy, setBusy] = useState(false);

  async function unkeep() {
    setBusy(true);
    setLabel("取消中");
    try {
      const response = await fetch("/api/memories/keep", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const data = (await response.json()) as { released?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error ?? "取消失败");
      setLabel(data.released ? "已取消" : "无需取消");
      window.setTimeout(() => window.location.reload(), 650);
    } catch {
      setLabel("重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="sync-retry-button" type="button" onClick={unkeep} disabled={busy}>
      {label}
    </button>
  );
}

"use client";

import { useState } from "react";

export function KeepArchiveCandidateButton({ id, title }: { id: string; title: string }) {
  const [label, setLabel] = useState("保留");
  const [busy, setBusy] = useState(false);

  async function keep() {
    setBusy(true);
    setLabel("保留中");
    try {
      const response = await fetch("/api/memories/keep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, reason: `人工确认保留：${title}` })
      });
      const data = (await response.json()) as { kept?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error ?? "保留失败");
      setLabel(data.kept ? "已保留" : "无需保留");
      window.setTimeout(() => window.location.reload(), 650);
    } catch {
      setLabel("重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="sync-retry-button" type="button" onClick={keep} disabled={busy}>
      {label}
    </button>
  );
}

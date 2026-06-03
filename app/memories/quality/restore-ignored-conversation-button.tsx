"use client";

import { useState } from "react";

export function RestoreIgnoredConversationButton({ id }: { id: string }) {
  const [label, setLabel] = useState("恢复");
  const [busy, setBusy] = useState(false);

  async function restore() {
    setBusy(true);
    setLabel("恢复中");
    try {
      const response = await fetch("/api/memories/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const data = (await response.json()) as { restoredConversations?: number; error?: string };
      if (!response.ok) throw new Error(data.error ?? "恢复失败");
      setLabel(data.restoredConversations ? "已恢复" : "无需恢复");
      window.setTimeout(() => window.location.reload(), 650);
    } catch {
      setLabel("重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="sync-retry-button" type="button" onClick={restore} disabled={busy}>
      {label}
    </button>
  );
}

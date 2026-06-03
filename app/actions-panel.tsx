"use client";

import { useState } from "react";

type ActionState = {
  label: string;
  detail: string;
  tone: "idle" | "ok" | "warn";
};

export function ActionsPanel({ date }: { date: string }) {
  const [state, setState] = useState<ActionState>({
    label: "准备就绪",
    detail: "采集 Codex、Claude 和本地项目后，会刷新今日复盘。",
    tone: "idle"
  });
  const [busy, setBusy] = useState(false);

  async function runIngest() {
    setBusy(true);
    setState({ label: "正在采集", detail: "读取本地历史与项目目录。", tone: "idle" });
    try {
      const response = await fetch("/api/ingest", { method: "POST" });
      const data = (await response.json()) as { conversations?: number; projects?: number; sources?: number; error?: string };
      if (!response.ok) throw new Error(data.error ?? "采集失败");
      setState({
        label: "采集完成",
        detail: `新增 ${data.conversations ?? 0} 条对话，更新 ${data.projects ?? 0} 个项目，记录 ${data.sources ?? 0} 个记忆来源。页面即将刷新。`,
        tone: "ok"
      });
      window.setTimeout(() => window.location.reload(), 650);
    } catch (error) {
      setState({ label: "采集失败", detail: String((error as Error).message), tone: "warn" });
    } finally {
      setBusy(false);
    }
  }

  async function exportReview() {
    setBusy(true);
    setState({ label: "正在导出", detail: "写入 Obsidian Daily 笔记。", tone: "idle" });
    try {
      const response = await fetch("/api/export/obsidian", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date })
      });
      const data = (await response.json()) as { path?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "导出失败");
      setState({ label: "导出完成", detail: data.path ?? "已写入 Obsidian。", tone: "ok" });
    } catch (error) {
      setState({ label: "导出失败", detail: String((error as Error).message), tone: "warn" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="command-strip" aria-label="复盘操作">
      <div>
        <p className={`status-dot ${state.tone}`}>{state.label}</p>
        <p>{state.detail}</p>
      </div>
      <div className="command-actions">
        <button type="button" onClick={runIngest} disabled={busy}>
          采集
        </button>
        <button type="button" onClick={exportReview} disabled={busy}>
          导出
        </button>
      </div>
    </section>
  );
}

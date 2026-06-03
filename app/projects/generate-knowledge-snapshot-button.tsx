"use client";

import { useState } from "react";

type GenerateState = {
  label: string;
  detail: string;
  tone: "idle" | "ok" | "warn";
};

export function GenerateKnowledgeSnapshotButton({ projectName }: { projectName: string }) {
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<GenerateState>({
    label: "生成阶段快照",
    detail: "从项目结构、记忆、健康状态和测试信号生成知识库续写。",
    tone: "idle"
  });

  async function generate() {
    setBusy(true);
    setState({ label: "正在生成", detail: "写入 SQLite 阶段快照。", tone: "idle" });
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectName)}/knowledge-snapshot`, { method: "POST" });
      const data = (await response.json()) as { snapshot?: { capturedAt?: string }; error?: string };
      if (!response.ok) throw new Error(data.error ?? "生成失败");
      setState({
        label: "快照已生成",
        detail: data.snapshot?.capturedAt ?? "已写入阶段快照，页面即将刷新。",
        tone: "ok"
      });
      window.setTimeout(() => window.location.reload(), 650);
    } catch (error) {
      setState({ label: "生成失败", detail: String((error as Error).message), tone: "warn" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="knowledge-snapshot-command">
      <button className={`project-export-button ${state.tone}`} type="button" onClick={generate} disabled={busy}>
        {state.label}
      </button>
      <p>{state.detail}</p>
    </div>
  );
}

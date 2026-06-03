"use client";

import { useState } from "react";

import type { ArchiveCandidateKind, ConversationItem, SourceKind } from "../../../lib/types.ts";

type CleanupState = {
  label: string;
  detail: string;
  tone: "idle" | "ok" | "warn";
  confirming: boolean;
  samples: string[];
};

export function CleanupArchiveCandidatesButton({
  count,
  label = "清理候选",
  source,
  summaryOrigin,
  candidateKind,
  projectName
}: {
  count: number;
  label?: string;
  source?: SourceKind;
  summaryOrigin?: ConversationItem["summaryOrigin"];
  candidateKind?: ArchiveCandidateKind;
  projectName?: string;
}) {
  const [state, setState] = useState<CleanupState>({
    label,
    detail: "仅忽略纯命令和短问候，后续采集不会恢复。",
    tone: "idle",
    confirming: false,
    samples: []
  });
  const [busy, setBusy] = useState(false);

  async function cleanup() {
    if (!state.confirming) {
      setBusy(true);
      setState({ label: "正在预览", detail: "正在读取将要清理的候选。", tone: "idle", confirming: false, samples: [] });
      try {
        const response = await fetch("/api/memories/cleanup", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source, summaryOrigin, candidateKind, projectName })
        });
        const data = (await response.json()) as { summary?: { matchedCandidates?: number; sampleTitles?: string[] }; error?: string };
        if (!response.ok) throw new Error(data.error ?? "预览失败");
        const matchedCandidates = data.summary?.matchedCandidates ?? 0;
        const sampleTitles = data.summary?.sampleTitles ?? [];
        setState({
          label: `确认清理 ${matchedCandidates} 条`,
          detail: matchedCandidates > 0 ? "确认前请查看下方样例，再点一次执行清理。" : "没有匹配到可清理候选。",
          tone: matchedCandidates > 0 ? "warn" : "ok",
          confirming: matchedCandidates > 0,
          samples: sampleTitles
        });
      } catch (error) {
        setState({ label: "重试预览", detail: String((error as Error).message), tone: "warn", confirming: false, samples: [] });
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    setState({ label: "正在清理", detail: "写入忽略记录并移除低价值记忆。", tone: "idle", confirming: true, samples: state.samples });
    try {
      const response = await fetch("/api/memories/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, summaryOrigin, candidateKind, projectName })
      });
      const data = (await response.json()) as { deletedConversations?: number; error?: string };
      if (!response.ok) throw new Error(data.error ?? "清理失败");
      setState({
        label: `已清理 ${data.deletedConversations ?? 0} 条`,
        detail: "归档候选已移除，正在刷新质量统计。",
        tone: "ok",
        confirming: false,
        samples: []
      });
      window.setTimeout(() => window.location.reload(), 650);
    } catch (error) {
      setState({
        label: "重试清理",
        detail: String((error as Error).message),
        tone: "warn",
        confirming: true,
        samples: state.samples
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="quality-cleanup-command">
      <button className={`project-export-button ${state.tone}`} type="button" onClick={cleanup} disabled={busy || count === 0} title={state.detail}>
        {state.label}
      </button>
      <p aria-live="polite">{state.detail}</p>
      {state.samples.length > 0 ? (
        <ul>
          {state.samples.map((sample, index) => (
            <li key={`${sample}:${index}`}>{sample}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

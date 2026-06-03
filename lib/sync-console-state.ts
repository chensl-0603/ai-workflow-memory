import type { SyncRun } from "./types.ts";

export type SyncControlState = {
  label: string;
  detail: string;
  tone: "idle" | "ok" | "warn";
};

const idleState: SyncControlState = {
  label: "同步到 Obsidian",
  detail: "写入 Daily、Actions、Strategy 和项目档案。",
  tone: "idle"
};

function failureDetail(message: string) {
  return `上次同步失败：${message}`;
}

export function getInitialSyncControlState(runs: SyncRun[]): SyncControlState {
  const latest = runs[0];
  if (latest?.status !== "fail") return idleState;

  return {
    label: "重新同步",
    detail: failureDetail(latest.diagnosis?.title ?? latest.message),
    tone: "warn"
  };
}

export function getFailedSyncControlState(message: string): SyncControlState {
  return {
    label: "重新同步",
    detail: failureDetail(message),
    tone: "warn"
  };
}

export function getRetryableSyncRunId(runs: SyncRun[]) {
  const latest = runs[0];
  return latest?.status === "fail" ? latest.id : null;
}

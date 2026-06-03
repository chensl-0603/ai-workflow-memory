import os from "node:os";
import path from "node:path";

import type { AppConfig } from "./types.ts";

const projectRoot = process.cwd();
const homeDir = os.homedir();
function envPath(name: string, fallback: string) {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}
const shanghaiDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export const defaultConfig: AppConfig = {
  dbPath: envPath("AIWM_DB_PATH", path.join(projectRoot, "data", "memory.sqlite")),
  codexIndexPath: envPath("AIWM_CODEX_INDEX_PATH", path.join(homeDir, ".codex", "session_index.jsonl")),
  claudeHistoryPath: envPath("AIWM_CLAUDE_HISTORY_PATH", path.join(homeDir, ".claude", "history.jsonl")),
  claudeProjectsRoot: envPath("AIWM_CLAUDE_PROJECTS_ROOT", path.join(homeDir, ".claude", "projects")),
  projectsRoot: envPath("AIWM_PROJECTS_ROOT", path.join(homeDir, "Projects")),
  obsidianVault: envPath("AIWM_OBSIDIAN_VAULT", path.join(projectRoot, "output", "obsidian-vault"))
};

export function toDateKey(value: string | number | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return shanghaiDateFormatter.format(new Date());
  }
  return shanghaiDateFormatter.format(date);
}

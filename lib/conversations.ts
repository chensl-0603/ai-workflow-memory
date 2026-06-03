import { readdir } from "node:fs/promises";
import path from "node:path";

import type { ConversationItem } from "./types.ts";
import { readJsonLines } from "./jsonl.ts";
import { tagConversation } from "./tags.ts";

type CodexIndexEntry = {
  id?: unknown;
  thread_name?: unknown;
  updated_at?: unknown;
};

type CodexSessionSummary = {
  cwd: string | null;
  summary: string;
};

type ClaudeSessionSummary = {
  summary: string;
};

type ClaudeHistoryEntry = {
  display?: unknown;
  timestamp?: unknown;
  project?: unknown;
  sessionId?: unknown;
};

async function listJsonlFiles(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map((entry) => {
        const entryPath = path.join(root, entry.name);
        if (entry.isDirectory()) return listJsonlFiles(entryPath);
        if (entry.isFile() && entry.name.endsWith(".jsonl")) return [entryPath];
        return [];
      })
    );
    return nested.flat();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getPayload(row: unknown) {
  return asRecord(asRecord(row)?.payload);
}

function getSessionId(row: unknown): string | null {
  const payload = getPayload(row);
  const id = payload?.id;
  return typeof id === "string" ? id : null;
}

function extractTextParts(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(extractTextParts);
  const record = asRecord(value);
  if (!record) return [];
  return ["text", "input_text", "output_text"]
    .flatMap((key) => extractTextParts(record[key]))
    .filter((text) => text.trim().length > 0);
}

function readSessionMessageText(row: unknown): string | null {
  const payload = getPayload(row);
  if (!payload) return null;
  const item = asRecord(payload.item) ?? payload;
  const role = item.role;
  if (role !== "user" && role !== "assistant") return null;
  const text = extractTextParts(item.content).join(" ").replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : null;
}

function readClaudeSessionMessageText(row: unknown): string | null {
  const record = asRecord(row);
  if (!record || (record.type !== "user" && record.type !== "assistant")) return null;
  const message = asRecord(record.message);
  const text = extractTextParts(message?.content).join(" ").replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : null;
}

function clipSummaryText(value: string, limit = 220) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized;
}

function isContextNoise(message: string) {
  const normalized = message.toLocaleLowerCase("zh-CN");
  return [
    "# agents.md instructions",
    "<goal_context>",
    "continue working toward the active thread goal",
    "knowledge cutoff:",
    "you are codex",
    "collaboration mode:",
    "sandbox_mode",
    "approval policy",
    "external_agent_tool_call",
    "external_agent_tool_result"
  ].some((pattern) => normalized.includes(pattern));
}

function extractClues(messages: string[]) {
  const text = messages.join(" ");
  const matches = text.match(/[A-Za-z][A-Za-z0-9]*(?:[-_/.:][A-Za-z0-9]+)+|[A-Za-z]{2,}/g) ?? [];
  return Array.from(new Set(matches.map((match) => match.trim()).filter((match) => match.length >= 3))).slice(0, 8);
}

function buildStructuredSummary(messages: string[]) {
  const cleanMessages = messages
    .filter((message) => !isContextNoise(message))
    .map((message) => clipSummaryText(message))
    .filter(Boolean);
  if (cleanMessages.length === 0) return "";

  const objective = cleanMessages[0];
  const progress = cleanMessages.find((message, index) => index > 0 && /已|完成|实现|修复|补|生成|写入|通过/.test(message)) ?? cleanMessages[1];
  const clues = extractClues(cleanMessages);

  return [
    `目标：${objective}`,
    progress ? `进展：${progress}` : null,
    clues.length > 0 ? `线索：${clues.join("、")}` : null
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n")
    .slice(0, 1200);
}

function buildTitleFallbackSummary(title: string, tags: string[]) {
  const clues = tags.length > 0 ? `\n线索：${tags.join("、")}` : "";
  return `目标：${clipSummaryText(title)}\n进展：仅标题索引，待补正文。${clues}`;
}

async function readCodexSessionSummaries(sessionsRoot: string) {
  const files = await listJsonlFiles(sessionsRoot);
  const summaries = new Map<string, CodexSessionSummary>();

  await Promise.all(
    files.map(async (file) => {
      const rows = await readJsonLines(file);
      let sessionId: string | null = null;
      let cwd: string | null = null;
      const messages: string[] = [];

      for (const row of rows) {
        const record = asRecord(row);
        if (record?.type === "session_meta") {
          const payload = getPayload(row);
          sessionId = getSessionId(row) ?? sessionId;
          cwd = typeof payload?.cwd === "string" ? payload.cwd : cwd;
          continue;
        }

        if (record?.type === "response_item" && messages.length < 6) {
          const text = readSessionMessageText(row);
          if (text && !isContextNoise(text)) messages.push(text);
        }
      }

      if (sessionId) {
        summaries.set(sessionId, {
          cwd,
          summary: buildStructuredSummary(messages)
        });
      }
    })
  );

  return summaries;
}

async function readClaudeSessionSummaries(projectsRoot: string) {
  const files = await listJsonlFiles(projectsRoot);
  const summaries = new Map<string, ClaudeSessionSummary>();

  await Promise.all(
    files.map(async (file) => {
      const rows = await readJsonLines(file);
      const messages = rows.flatMap((row) => {
        const text = readClaudeSessionMessageText(row);
        return text && !isContextNoise(text) ? [text] : [];
      });
      const summary = buildStructuredSummary(messages.slice(0, 6));
      if (summary) {
        summaries.set(path.basename(file, ".jsonl"), { summary });
      }
    })
  );

  return summaries;
}

export async function readCodexConversations(indexPath: string): Promise<ConversationItem[]> {
  const rows = await readJsonLines(indexPath);
  const sessionSummaries = await readCodexSessionSummaries(path.join(path.dirname(indexPath), "sessions"));
  return rows
    .map((row) => row as CodexIndexEntry)
    .filter((row) => typeof row.id === "string" && typeof row.thread_name === "string")
    .map((row) => {
      const session = sessionSummaries.get(row.id as string);
      const item = {
        id: `codex:${row.id}`,
        source: "codex" as const,
        title: row.thread_name as string,
        summary: session?.summary ?? "",
        summaryOrigin: session?.summary ? ("thread-body" as const) : ("title-fallback" as const),
        projectPath: session?.cwd ?? null,
        occurredAt: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
        rawRef: row.id as string,
        tags: []
      };
      const tags = tagConversation(item);
      return { ...item, tags, summary: item.summary || buildTitleFallbackSummary(item.title, tags) };
    });
}

export async function readClaudeConversations(historyPath: string, projectsRoot: string): Promise<ConversationItem[]> {
  const rows = await readJsonLines(historyPath);
  const sessionSummaries = await readClaudeSessionSummaries(projectsRoot);
  return rows
    .map((row) => row as ClaudeHistoryEntry)
    .filter((row) => typeof row.display === "string" && row.display.trim().length > 0)
    .map((row, index) => {
      const timestamp = typeof row.timestamp === "number" ? row.timestamp : Date.now();
      const sessionId = typeof row.sessionId === "string" ? row.sessionId : `row-${index}`;
      const session = sessionSummaries.get(sessionId);
      const item = {
        id: `claude:${sessionId}:${timestamp}`,
        source: "claude" as const,
        title: row.display as string,
        summary: session?.summary ?? "",
        summaryOrigin: session?.summary ? ("thread-body" as const) : ("title-fallback" as const),
        projectPath: typeof row.project === "string" ? row.project : null,
        occurredAt: new Date(timestamp).toISOString(),
        rawRef: sessionId,
        tags: []
      };
      const tags = tagConversation(item);
      return { ...item, tags, summary: item.summary || buildTitleFallbackSummary(item.title, tags) };
    });
}

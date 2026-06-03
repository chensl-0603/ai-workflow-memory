import { ensureDatabase } from "./db.ts";
import type { ConversationItem, MemorySearchFilters, MemorySearchResult } from "./types.ts";

type ConversationRow = {
  id: string;
  source: string;
  title: string;
  summary: string;
  summary_origin: string;
  project_path: string | null;
  occurred_at: string;
  raw_ref: string;
  tags: string;
};

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function toConversation(row: ConversationRow): ConversationItem {
  return {
    id: row.id,
    source: row.source === "claude" ? "claude" : "codex",
    title: row.title,
    summary: row.summary,
    summaryOrigin:
      row.summary_origin === "manual" ? "manual" : row.summary_origin === "title-fallback" ? "title-fallback" : "thread-body",
    projectPath: row.project_path,
    occurredAt: row.occurred_at,
    rawRef: row.raw_ref,
    tags: parseJsonArray(row.tags)
  };
}

export async function searchMemories(
  dbPath: string,
  filters: MemorySearchFilters = {}
): Promise<MemorySearchResult> {
  const db = await ensureDatabase(dbPath);
  try {
    const rows = db
      .prepare(
        `SELECT id, source, title, summary, summary_origin, project_path, occurred_at, raw_ref, tags
         FROM conversations
         ORDER BY occurred_at DESC`
      )
      .all() as ConversationRow[];

    const allItems = rows.map(toConversation);
    const query = filters.query?.trim().toLocaleLowerCase("zh-CN");
    const source = filters.source && filters.source !== "all" ? filters.source : null;
    const project = filters.project?.trim().toLocaleLowerCase("zh-CN");
    const tag = filters.tag?.trim();

    const items = allItems
      .filter(
        (item) => !query || `${item.title} ${item.summary} ${item.projectPath ?? ""}`.toLocaleLowerCase("zh-CN").includes(query)
      )
      .filter((item) => !source || item.source === source)
      .filter((item) => !project || (item.projectPath ?? "").toLocaleLowerCase("zh-CN").includes(project))
      .filter((item) => !tag || item.tags.includes(tag))
      .slice(0, filters.limit ?? 100);

    const availableTags = Array.from(new Set(allItems.flatMap((item) => item.tags))).sort((a, b) => a.localeCompare(b, "zh-CN"));
    const availableProjects = Array.from(
      new Set(allItems.map((item) => item.projectPath).filter((value): value is string => Boolean(value)))
    ).sort((a, b) => a.localeCompare(b, "zh-CN"));

    return { items, availableTags, availableProjects };
  } finally {
    db.close();
  }
}

import { stat } from "node:fs/promises";

import { ensureDatabase } from "./db.ts";

type ConversationPathRow = {
  id: string;
  project_path: string;
};

type ProjectPathRow = {
  path: string;
};

export type CleanupDeletedProjectMemoriesResult = {
  deletedConversations: number;
  deletedProjectSnapshots: number;
  missingConversationGroups: Array<{
    projectPath: string;
    count: number;
  }>;
  missingProjectPaths: string[];
};

async function exists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function cleanupDeletedProjectMemories(dbPath: string): Promise<CleanupDeletedProjectMemoriesResult> {
  const db = await ensureDatabase(dbPath);
  try {
    const conversationRows = db
      .prepare(
        `SELECT id, project_path
         FROM conversations
         WHERE project_path IS NOT NULL AND trim(project_path) <> ''`
      )
      .all() as ConversationPathRow[];
    const projectRows = db.prepare("SELECT path FROM project_snapshots").all() as ProjectPathRow[];

    const missingConversationRows: ConversationPathRow[] = [];
    for (const row of conversationRows) {
      if (!(await exists(row.project_path))) {
        missingConversationRows.push(row);
      }
    }

    const missingProjectPaths: string[] = [];
    for (const row of projectRows) {
      if (!(await exists(row.path))) {
        missingProjectPaths.push(row.path);
      }
    }

    const missingConversationGroups = Array.from(
      missingConversationRows.reduce((groups, row) => {
        groups.set(row.project_path, (groups.get(row.project_path) ?? 0) + 1);
        return groups;
      }, new Map<string, number>())
    )
      .map(([projectPath, count]) => ({ projectPath, count }))
      .sort((a, b) => a.projectPath.localeCompare(b.projectPath));

    db.exec("BEGIN");
    try {
      const deleteConversation = db.prepare("DELETE FROM conversations WHERE id = ?");
      for (const row of missingConversationRows) {
        deleteConversation.run(row.id);
      }

      const deleteProject = db.prepare("DELETE FROM project_snapshots WHERE path = ?");
      for (const projectPath of missingProjectPaths) {
        deleteProject.run(projectPath);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return {
      deletedConversations: missingConversationRows.length,
      deletedProjectSnapshots: missingProjectPaths.length,
      missingConversationGroups,
      missingProjectPaths: missingProjectPaths.sort((a, b) => a.localeCompare(b))
    };
  } finally {
    db.close();
  }
}

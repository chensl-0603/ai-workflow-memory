import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { exportProjectArchiveToObsidian } from "./obsidian.ts";
import { generateAllProjectKnowledgeSnapshots, getLatestProjectKnowledgeSnapshot } from "./project-knowledge.ts";
import { getProjectDetail } from "./project-detail.ts";
import { getDailyReview } from "./review.ts";
import type { ProjectArchiveIndex, ProjectArchiveIndexItem, ProjectManualSections } from "./types.ts";

const manualStart = "<!-- MANUAL_NOTES_START -->";
const manualEnd = "<!-- MANUAL_NOTES_END -->";

export function projectArchivePath(obsidianVault: string, projectName: string) {
  const safeName = projectName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim() || "untitled-project";
  return path.join(obsidianVault, "Projects", `${safeName}.md`);
}

async function fileExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function extractManualNotes(markdown: string) {
  const start = markdown.indexOf(manualStart);
  const end = markdown.indexOf(manualEnd);
  if (start === -1 || end === -1 || end < start) return "";
  return markdown.slice(start + manualStart.length, end).trim();
}

export async function readProjectManualNotes(obsidianVault: string, projectName: string) {
  try {
    const markdown = await readFile(projectArchivePath(obsidianVault, projectName), "utf8");
    return extractManualNotes(markdown);
  } catch {
    return "";
  }
}

export function parseProjectManualNotes(notes: string): ProjectManualSections {
  const sections: ProjectManualSections = {
    goals: [],
    decisions: [],
    blockers: [],
    notes: []
  };
  for (const rawLine of notes.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const normalized = line.replace(/^[-*]\s*/, "");
    const match = /^(目标|决策|阻塞)\s*[：:]\s*(.+)$/.exec(normalized);
    if (!match) {
      sections.notes.push(normalized);
      continue;
    }
    const [, kind, value] = match;
    if (kind === "目标") sections.goals.push(value);
    if (kind === "决策") sections.decisions.push(value);
    if (kind === "阻塞") sections.blockers.push(value);
  }
  return sections;
}

export async function getProjectArchiveIndex(options: {
  dbPath: string;
  obsidianVault: string;
}): Promise<ProjectArchiveIndex> {
  const review = await getDailyReview(options.dbPath, new Date().toISOString().slice(0, 10));
  const items = (
    await Promise.all(
      review.projects.map(async (project): Promise<ProjectArchiveIndexItem | null> => {
        const detail = await getProjectDetail(options.dbPath, project.name);
        if (!detail) return null;
        const archivePath = projectArchivePath(options.obsidianVault, project.name);
        const warningCount = detail.health.filter((check) => check.status !== "ok").length;
        const archiveExists = await fileExists(archivePath);
        const manualNotes = archiveExists ? await readProjectManualNotes(options.obsidianVault, project.name) : "";
        const latestKnowledgeSnapshot = await getLatestProjectKnowledgeSnapshot(options.dbPath, project.name);
        return {
          project,
          archivePath,
          archiveExists,
          latestKnowledgeSnapshot,
          knowledgeStale: !latestKnowledgeSnapshot || latestKnowledgeSnapshot.capturedAt < project.updatedAt,
          memoryCount: detail.memories.length,
          warningCount,
          nextActionCount: detail.nextActions.length,
          relatedTags: detail.relatedTags,
          manualNotes,
          manualSections: parseProjectManualNotes(manualNotes)
        };
      })
    )
  ).filter((item): item is ProjectArchiveIndexItem => Boolean(item));

  return {
    items,
    summary: {
      totalProjects: items.length,
      exportedProjects: items.filter((item) => item.archiveExists).length,
      totalMemories: items.reduce((total, item) => total + item.memoryCount, 0),
      warningProjects: items.filter((item) => item.warningCount > 0).length
    }
  };
}

export async function exportAllProjectArchives(options: {
  dbPath: string;
  obsidianVault: string;
}) {
  const index = await getProjectArchiveIndex(options);
  const snapshots = await generateAllProjectKnowledgeSnapshots({
    dbPath: options.dbPath,
    obsidianVault: options.obsidianVault,
    projectNames: index.items.map((item) => item.project.name)
  });
  const paths: string[] = [];
  for (const item of index.items) {
    const exportedPath = await exportProjectArchiveToObsidian({
      dbPath: options.dbPath,
      obsidianVault: options.obsidianVault,
      projectName: item.project.name
    });
    if (exportedPath) {
      paths.push(exportedPath);
    }
  }
  return {
    exported: paths.length,
    snapshots: snapshots.length,
    paths
  };
}

import Link from "next/link";

import { EmptyState } from "../empty-state";
import { AppNav } from "../nav";
import { ExportAllProjectsButton } from "./export-all-projects-button";
import { defaultConfig } from "../../lib/paths.ts";
import { getProjectArchiveIndex } from "../../lib/project-archives.ts";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const archiveIndex = await getProjectArchiveIndex({
    dbPath: defaultConfig.dbPath,
    obsidianVault: defaultConfig.obsidianVault
  });

  return (
    <>
      <AppNav />
      <main className="workspace">
        <header className="page-header">
          <div>
            <p className="eyebrow">D:/Project</p>
            <h1>项目驾驶舱</h1>
          </div>
          <div className="project-header-actions">
            <p>扫描本地项目目录，跟踪记忆、提醒和 Obsidian 项目档案状态。</p>
            <ExportAllProjectsButton />
          </div>
        </header>

        <section className="project-index-summary" aria-label="项目档案概况">
          <div>
            <span>{archiveIndex.summary.totalProjects}</span>
            <p>项目</p>
          </div>
          <div>
            <span>{archiveIndex.summary.exportedProjects}</span>
            <p>已导出档案</p>
          </div>
          <div>
            <span>{archiveIndex.summary.totalMemories}</span>
            <p>关联记忆</p>
          </div>
          <div>
            <span>{archiveIndex.summary.warningProjects}</span>
            <p>有提醒</p>
          </div>
        </section>

        <section className="panel">
          {archiveIndex.items.length === 0 ? (
            <EmptyState title="还没有项目快照" detail="运行采集后会生成第一批项目状态。" />
          ) : (
            <div className="project-table">
              {archiveIndex.items.map((item) => (
                <Link key={item.project.path} className="project-table-row archive-index-row" href={`/projects/${encodeURIComponent(item.project.name)}`}>
                  <div>
                    <strong>{item.project.name}</strong>
                    <p>{item.project.path}</p>
                  </div>
                  <span>{item.project.techStack.join(" / ")}</span>
                  <span>{item.memoryCount} 记忆</span>
                  <span>{item.warningCount} 提醒</span>
                  <span>{item.nextActionCount} 建议</span>
                  <span>{item.latestKnowledgeSnapshot ? (item.knowledgeStale ? "快照落后" : "快照已生成") : "无快照"}</span>
                  <span className={item.archiveExists ? "archive-status exported" : "archive-status"}>{item.archiveExists ? "已导出" : "未导出"}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

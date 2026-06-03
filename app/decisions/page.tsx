import Link from "next/link";

import { EmptyState } from "../empty-state";
import { AppNav } from "../nav";
import { getDecisionTimeline } from "../../lib/decisions.ts";
import { defaultConfig } from "../../lib/paths.ts";

export const dynamic = "force-dynamic";

export default async function DecisionsPage() {
  const timeline = await getDecisionTimeline({
    dbPath: defaultConfig.dbPath,
    obsidianVault: defaultConfig.obsidianVault
  });

  return (
    <>
      <AppNav />
      <main className="workspace">
        <header className="page-header">
          <div>
            <p className="eyebrow">Project Decisions</p>
            <h1>决策时间线</h1>
          </div>
          <p>从 Obsidian 项目档案的手动备注区聚合“决策：...”记录，保留跨项目的判断脉络。</p>
        </header>

        <section className="project-index-summary" aria-label="决策概况">
          <div>
            <span>{timeline.summary.totalDecisions}</span>
            <p>决策</p>
          </div>
          <div>
            <span>{timeline.summary.projectsWithDecisions}</span>
            <p>覆盖项目</p>
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <h2>决策记录</h2>
            <Link href="/projects">项目档案</Link>
          </div>
          {timeline.items.length === 0 ? (
            <EmptyState title="还没有决策记录" detail="在项目档案手动备注区写入“决策：...”后，这里会自动汇总。" />
          ) : (
            <ol className="decision-list">
              {timeline.items.map((item, index) => (
                <li key={`${item.projectName}-${index}-${item.text}`}>
                  <div>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <Link href={`/projects/${encodeURIComponent(item.projectName)}`}>{item.projectName}</Link>
                  </div>
                  <strong>{item.text}</strong>
                  <p>{item.projectPath}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
    </>
  );
}

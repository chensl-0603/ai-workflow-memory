import Link from "next/link";

import { EmptyState } from "../empty-state";
import { AppNav } from "../nav";
import { getGoalBoard } from "../../lib/goals.ts";
import { defaultConfig } from "../../lib/paths.ts";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const board = await getGoalBoard({
    dbPath: defaultConfig.dbPath,
    obsidianVault: defaultConfig.obsidianVault
  });

  return (
    <>
      <AppNav />
      <main className="workspace">
        <header className="page-header">
          <div>
            <p className="eyebrow">Project Goals</p>
            <h1>
              长期目标
              <br />
              <span>把项目方向从备注里提出来。</span>
            </h1>
          </div>
          <p>从 Obsidian 项目档案的手动备注区聚合“目标：...”记录，让长期方向和每天行动保持同一张地图。</p>
        </header>

        <section className="project-index-summary" aria-label="目标概况">
          <div>
            <span>{board.summary.totalGoals}</span>
            <p>目标</p>
          </div>
          <div>
            <span>{board.summary.projectsWithGoals}</span>
            <p>覆盖项目</p>
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <h2>目标记录</h2>
            <Link href="/projects">项目档案</Link>
          </div>
          {board.items.length === 0 ? (
            <EmptyState title="还没有长期目标" detail="在项目档案手动备注区写入“目标：...”后，这里会自动汇总。" />
          ) : (
            <ol className="goal-list">
              {board.items.map((item, index) => (
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

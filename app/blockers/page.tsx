import Link from "next/link";

import { EmptyState } from "../empty-state";
import { AppNav } from "../nav";
import { getBlockerBoard } from "../../lib/blockers.ts";
import { defaultConfig } from "../../lib/paths.ts";

export const dynamic = "force-dynamic";

const sourceLabel = {
  manual: "手动",
  health: "环境"
};

export default async function BlockersPage() {
  const board = await getBlockerBoard({
    dbPath: defaultConfig.dbPath,
    obsidianVault: defaultConfig.obsidianVault
  });

  return (
    <>
      <AppNav />
      <main className="workspace">
        <header className="page-header">
          <div>
            <p className="eyebrow">Project Blockers</p>
            <h1>阻塞看板</h1>
          </div>
          <p>聚合 Obsidian 项目档案里的“阻塞：...”和本地环境健康提醒，优先看到最该处理的卡点。</p>
        </header>

        <section className="project-index-summary" aria-label="阻塞概况">
          <div>
            <span>{board.summary.totalBlockers}</span>
            <p>阻塞</p>
          </div>
          <div>
            <span>{board.summary.manualBlockers}</span>
            <p>手动记录</p>
          </div>
          <div>
            <span>{board.summary.healthBlockers}</span>
            <p>环境提醒</p>
          </div>
          <div>
            <span>{board.summary.projectsWithBlockers}</span>
            <p>涉及项目</p>
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <h2>阻塞项</h2>
            <Link href="/health">环境体检</Link>
          </div>
          {board.items.length === 0 ? (
            <EmptyState title="暂无阻塞" detail="在项目档案手动备注区写入“阻塞：...”或运行健康检查后，这里会自动汇总。" />
          ) : (
            <ol className="blocker-list">
              {board.items.map((item, index) => (
                <li key={`${item.projectName}-${item.source}-${index}-${item.text}`} className={item.source}>
                  <div>
                    <span>{sourceLabel[item.source]}</span>
                    <Link href={`/projects/${encodeURIComponent(item.projectName)}`}>{item.projectName}</Link>
                  </div>
                  <strong>{item.text}</strong>
                  {item.suggestion ? <p>{item.suggestion}</p> : <p>{item.projectPath}</p>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
    </>
  );
}

import Link from "next/link";

import { AppNav } from "../nav";
import { EmptyState } from "../empty-state";
import { ExportStrategyButton } from "./export-strategy-button";
import { getStrategyBoard } from "../../lib/strategy.ts";
import { defaultConfig, toDateKey } from "../../lib/paths.ts";

export const dynamic = "force-dynamic";

function BriefList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="strategy-brief">
      <span>{title}</span>
      {items.length === 0 ? (
        <p>暂无记录</p>
      ) : (
        <ul>
          {items.slice(0, 3).map((item, index) => (
            <li key={`${title}-${index}-${item}`}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function StrategyPage() {
  const today = toDateKey(new Date());
  const board = await getStrategyBoard({
    dbPath: defaultConfig.dbPath,
    obsidianVault: defaultConfig.obsidianVault,
    today
  });

  return (
    <>
      <AppNav />
      <main className="workspace">
        <header className="page-header">
          <div>
            <p className="eyebrow">Project Strategy</p>
            <h1>
              项目战略面板
              <br />
              <span>把方向、判断和卡点放到一张桌上。</span>
            </h1>
          </div>
          <p>
            聚合项目目标、决策、阻塞和未完成行动，让每个项目的长期脉络能被快速扫到，而不是散落在多个页面里。
          </p>
        </header>

        <section className="project-index-summary" aria-label="战略概况">
          <div>
            <span>{board.summary.totalProjects}</span>
            <p>项目</p>
          </div>
          <div>
            <span>{board.summary.projectsWithGoals}</span>
            <p>有目标</p>
          </div>
          <div>
            <span>{board.summary.projectsWithBlockers}</span>
            <p>有阻塞</p>
          </div>
          <div>
            <span>{board.summary.projectsWithActions}</span>
            <p>有行动</p>
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <h2>项目脉络</h2>
            <div className="section-actions">
              <ExportStrategyButton today={today} />
              <Link href="/projects">项目档案</Link>
            </div>
          </div>
          {board.items.length === 0 ? (
            <EmptyState title="还没有战略数据" detail="导出项目档案并在手动备注区写入目标、决策或阻塞后，这里会自动汇总。" />
          ) : (
            <div className="strategy-list">
              {board.items.map((item) => (
                <article key={item.project.path} className="strategy-row">
                  <div className="strategy-row-header">
                    <div>
                      <Link href={`/projects/${encodeURIComponent(item.project.name)}`}>{item.project.name}</Link>
                      <p>{item.project.techStack.join(" / ")}</p>
                      {item.latestKnowledgeSnapshot ? <p>{item.latestKnowledgeSnapshot.summary}</p> : null}
                    </div>
                    <span>{item.memoryCount} 记忆</span>
                    <span>{item.warningCount} 提醒</span>
                  </div>
                  <div className="strategy-columns">
                    <BriefList title="目标" items={item.goals} />
                    <BriefList title="决策" items={item.decisions} />
                    <BriefList title="阻塞" items={item.blockers.map((blocker) => blocker.text)} />
                    <BriefList title="行动" items={item.actions.map((action) => `${action.title}（${action.count} 次）`)} />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

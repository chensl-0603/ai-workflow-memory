import Link from "next/link";

import { ActionStatusControls } from "./action-status-controls";
import { ActionsPanel } from "./actions-panel";
import { EmptyState } from "./empty-state";
import { AppNav } from "./nav";
import { getDailyActions } from "../lib/daily-actions.ts";
import { defaultConfig, toDateKey } from "../lib/paths.ts";
import { getDailyReview } from "../lib/review.ts";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const date = toDateKey(new Date());
  const [review, dailyActions] = await Promise.all([
    getDailyReview(defaultConfig.dbPath, date),
    getDailyActions({
      dbPath: defaultConfig.dbPath,
      obsidianVault: defaultConfig.obsidianVault,
      date
    })
  ]);
  const activeProjects = review.projects.slice(0, 5);
  const recentConversations = review.conversations.slice(0, 6);
  const warnings = review.health.filter((check) => check.status !== "ok").slice(0, 5);

  return (
    <>
      <AppNav />
      <main className="workspace">
        <header className="page-header">
          <div>
            <p className="eyebrow">{date}</p>
            <h1>
              把 AI 协作
              <br />
              <span>沉淀成工作流记忆。</span>
            </h1>
          </div>
          <p>{review.summary}</p>
        </header>

        <ActionsPanel date={date} />

        <section className="panel daily-actions-panel">
          <div className="section-heading">
            <h2>今日行动</h2>
            <span className="muted-label">{dailyActions.summary.totalActions} 项</span>
          </div>
          {dailyActions.items.length === 0 ? (
            <EmptyState title="暂无行动建议" detail="采集记忆、导出项目档案或补充手动备注后，这里会生成本地规则建议。" />
          ) : (
            <ol className="daily-action-list">
              {dailyActions.items.map((item) => (
                <li key={item.id} className={item.status !== "open" ? "resolved" : undefined}>
                  <span>{item.kind}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                  <div className="daily-action-tail">
                    <Link href={item.href}>打开</Link>
                    <ActionStatusControls date={date} actionId={item.id} initialStatus={item.status} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="metrics-grid" aria-label="今日概况">
          <div>
            <span>{review.conversations.length}</span>
            <p>今日对话</p>
          </div>
          <div>
            <span>{review.projects.length}</span>
            <p>追踪项目</p>
          </div>
          <div>
            <span>{warnings.length}</span>
            <p>环境提醒</p>
          </div>
        </section>

        <div className="two-column">
          <section className="panel">
            <div className="section-heading">
              <h2>最近记忆</h2>
              <Link href="/memories">查看全部</Link>
            </div>
            {recentConversations.length === 0 ? (
              <EmptyState title="还没有今日对话" detail="点击采集后，会从 Codex 和 Claude 本地历史生成记忆流。" />
            ) : (
              <ol className="timeline-list">
                {recentConversations.map((item) => (
                  <li key={item.id}>
                    <time>{new Date(item.occurredAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.summary || (item.source === "codex" ? "Codex" : "Claude")}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="panel">
            <div className="section-heading">
              <h2>活跃项目</h2>
              <Link href="/projects">打开驾驶舱</Link>
            </div>
            {activeProjects.length === 0 ? (
              <EmptyState title="还没有项目快照" detail="项目扫描会识别 D:/Project 下的技术栈、脚本和 Git 状态。" />
            ) : (
              <div className="project-stack">
                {activeProjects.map((project) => (
                  <Link key={project.path} className="project-row" href={`/projects/${encodeURIComponent(project.name)}`}>
                    <div>
                      <strong>{project.name}</strong>
                      <p>{project.techStack.join(" / ")}</p>
                    </div>
                    <span>{project.hasGit ? "Git" : "目录"}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="panel">
          <div className="section-heading">
            <h2>环境提醒</h2>
            <Link href="/health">查看体检</Link>
          </div>
          {warnings.length === 0 ? (
            <EmptyState title="暂无提醒" detail="健康检查会把缺失工具、环境变量文件和阻塞项集中显示。" />
          ) : (
            <div className="health-list">
              {warnings.map((check) => (
                <article key={check.id} className={`health-row ${check.status}`}>
                  <strong>{check.label}</strong>
                  <p>{check.detail}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

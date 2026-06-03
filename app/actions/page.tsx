import Link from "next/link";

import { AppNav } from "../nav";
import { EmptyState } from "../empty-state";
import { ExportActionsButton } from "./export-actions-button";
import { getActionInbox } from "../../lib/action-inbox.ts";
import { defaultConfig, toDateKey } from "../../lib/paths.ts";

export const dynamic = "force-dynamic";

const priorityLabels = {
  high: "高优先级",
  medium: "中优先级",
  low: "低优先级"
} as const;

export default async function ActionsPage() {
  const today = toDateKey(new Date());
  const inbox = await getActionInbox({
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
            <p className="eyebrow">Action Inbox</p>
            <h1>
              行动收件箱
              <br />
              <span>把未完成的复盘拉回眼前。</span>
            </h1>
          </div>
          <p>
            当前有 {inbox.summary.totalActions} 个未完成行动，其中 {inbox.summary.snoozedActions} 个已延后，分布在 {inbox.summary.datesWithActions} 个复盘日。
          </p>
        </header>

        <section className="project-index-summary action-inbox-summary" aria-label="行动收件箱概况">
          <div>
            <span>{inbox.summary.totalActions}</span>
            <p>未完成行动</p>
          </div>
          <div>
            <span>{inbox.summary.openActions}</span>
            <p>待处理</p>
          </div>
          <div>
            <span>{inbox.summary.snoozedActions}</span>
            <p>已延后</p>
          </div>
          <div>
            <span>{inbox.summary.datesWithActions}</span>
            <p>涉及复盘日</p>
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <h2>未完成行动</h2>
            <div className="section-actions">
              <ExportActionsButton />
              <Link href="/">回到今日</Link>
            </div>
          </div>
          {inbox.groups.length === 0 ? (
            <EmptyState title="行动收件箱已清空" detail="新的阻塞、项目档案缺口、今日记忆或环境提醒出现后，这里会重新聚合。" />
          ) : (
            <div className="action-inbox-list">
              {inbox.groups.map((item) => (
                <article key={item.key} className={`action-inbox-row ${item.status}`}>
                  <div className="action-inbox-meta">
                    <time>{item.latestDate}</time>
                    <span>{priorityLabels[item.priority]}</span>
                    <span>{item.kind}</span>
                    {item.projectName ? <span>{item.projectName}</span> : null}
                    {item.count > 1 ? <span>{item.count} 次</span> : null}
                  </div>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                    <p>{item.reason}</p>
                    <small>完成证据：{item.completionEvidence}</small>
                    <small>{item.dates.join(" / ")}</small>
                  </div>
                  <div className="action-inbox-tail">
                    <Link href={item.href}>打开</Link>
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

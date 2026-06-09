import Link from "next/link";

import { AppNav } from "../nav";
import { EmptyState } from "../empty-state";
import { ExportActionsButton } from "./export-actions-button";
import { getActionInbox } from "../../lib/action-inbox.ts";
import { defaultConfig, toDateKey } from "../../lib/paths.ts";
import type { DailyActionEvidence } from "../../lib/types.ts";

export const dynamic = "force-dynamic";

const priorityLabels = {
  high: "高优先级",
  medium: "中优先级",
  low: "低优先级"
} as const;

const evidenceKindLabels = {
  commit: "提交",
  test: "测试",
  sync: "同步",
  manual: "手动"
} as const;

const escalationLabels = {
  blocker: "已升为阻塞",
  risk: "已升为风险"
} as const;

function evidenceSummary(item: { evidence: DailyActionEvidence[]; completionEvidence: string }) {
  if (item.evidence.length === 0) return item.completionEvidence;
  return item.evidence.map((evidence) => `${evidenceKindLabels[evidence.kind]}：${evidence.label} - ${evidence.detail}`).join("；");
}

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
            <span>{inbox.summary.completedActions}</span>
            <p>最近完成</p>
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
                    {item.escalation.level ? <span>{escalationLabels[item.escalation.level]}</span> : null}
                  </div>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                    <p>{item.reason}</p>
                    {item.escalation.reason ? <p>{item.escalation.reason}</p> : null}
                    <small>完成证据：{evidenceSummary(item)}</small>
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

        <section className="panel">
          <div className="section-heading">
            <h2>最近完成</h2>
          </div>
          {inbox.completedItems.length === 0 ? (
            <EmptyState title="还没有完成证据" detail="行动标记完成并记录提交、测试或同步证据后，这里会显示最近收口记录。" />
          ) : (
            <div className="action-inbox-list">
              {inbox.completedItems.map((item) => (
                <article key={`${item.date}:${item.id}`} className="action-inbox-row done">
                  <div className="action-inbox-meta">
                    <time>{item.date}</time>
                    <span>{priorityLabels[item.priority]}</span>
                    <span>{item.kind}</span>
                    {item.projectName ? <span>{item.projectName}</span> : null}
                    {item.evidenceSource ? <span>{item.evidenceSource}</span> : null}
                  </div>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                    <small>完成证据：{evidenceSummary(item)}</small>
                    {item.completedAt ? <small>完成时间：{item.completedAt}</small> : null}
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

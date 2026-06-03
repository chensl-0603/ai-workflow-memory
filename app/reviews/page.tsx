import Link from "next/link";

import { AppNav } from "../nav";
import { EmptyState } from "../empty-state";
import { defaultConfig } from "../../lib/paths.ts";
import { getReviewHistory } from "../../lib/review-history.ts";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const history = await getReviewHistory({
    dbPath: defaultConfig.dbPath,
    obsidianVault: defaultConfig.obsidianVault
  });

  return (
    <>
      <AppNav />
      <main className="workspace">
        <header className="page-header">
          <div>
            <p className="eyebrow">Review History</p>
            <h1>
              复盘历史
              <br />
              <span>把每天的闭环串起来。</span>
            </h1>
          </div>
          <p>
            已沉淀 {history.summary.totalDays} 天复盘，导出 {history.summary.exportedDays} 天，累计 {history.summary.totalConversations} 条对话记忆。
          </p>
        </header>

        <section className="project-index-summary review-summary" aria-label="复盘历史概况">
          <div>
            <span>{history.summary.totalDays}</span>
            <p>复盘天数</p>
          </div>
          <div>
            <span>{history.summary.exportedDays}</span>
            <p>已导出 Daily</p>
          </div>
          <div>
            <span>{history.summary.totalConversations}</span>
            <p>累计对话</p>
          </div>
          <div>
            <span>{history.summary.daysWithActions}</span>
            <p>含行动建议</p>
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <h2>每日复盘</h2>
            <Link href="/">回到今日</Link>
          </div>
          {history.items.length === 0 ? (
            <EmptyState title="还没有复盘历史" detail="先运行采集并导出 Daily，这里会出现按日期排列的复盘索引。" />
          ) : (
            <div className="review-history-list">
              {history.items.map((item) => (
                <article key={item.date} className="review-history-row">
                  <div>
                    <time>{item.date}</time>
                    <strong>{item.conversationCount} 条对话</strong>
                  </div>
                  <div>
                    <span>{item.actionCount} 项行动</span>
                    <span className={item.exported ? "archive-status exported" : "archive-status"}>{item.exported ? "已导出" : "未导出"}</span>
                  </div>
                  <Link href={`/api/daily?date=${item.date}`}>查看 JSON</Link>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

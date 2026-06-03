import { EmptyState } from "../empty-state";
import { AppNav } from "../nav";
import { defaultConfig, toDateKey } from "../../lib/paths.ts";
import { getDailyReview } from "../../lib/review.ts";
import { getSourceHealthReport, sourceHealthToCheck } from "../../lib/source-health.ts";

export const dynamic = "force-dynamic";

const labelByStatus = {
  ok: "正常",
  warn: "注意",
  fail: "阻塞"
};

export default async function HealthPage() {
  const [review, sourceHealth] = await Promise.all([
    getDailyReview(defaultConfig.dbPath, toDateKey(new Date())),
    getSourceHealthReport(defaultConfig.dbPath)
  ]);
  const sourceChecks = sourceHealth.items.map(sourceHealthToCheck);

  return (
    <>
      <AppNav />
      <main className="workspace">
        <header className="page-header">
          <div>
            <p className="eyebrow">Runtime / Config</p>
            <h1>环境健康检查</h1>
          </div>
          <p>检查本地运行时和配置文件存在性，不展示任何密钥值。</p>
        </header>

        <section className="panel">
          {review.health.length === 0 ? (
            <EmptyState title="还没有体检结果" detail="运行采集后，系统会记录 Node、npm、Python、Java、Gradle 和环境文件状态。" />
          ) : (
            <div className="health-list">
              {review.health.map((check) => (
                <article key={check.id} className={`health-row ${check.status}`}>
                  <div>
                    <strong>{check.label}</strong>
                    <span>{labelByStatus[check.status]}</span>
                  </div>
                  <p>{check.detail}</p>
                  {check.suggestion ? <small>{check.suggestion}</small> : null}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>记忆源索引</h2>
              <p className="section-detail">
                已记录 {sourceHealth.summary.totalSources} 个来源，缺失 {sourceHealth.summary.missingSources} 个，共 {sourceHealth.summary.totalItems} 条索引。
              </p>
            </div>
          </div>
          {sourceChecks.length === 0 ? (
            <EmptyState title="还没有源索引记录" detail="运行采集后会记录 Codex session_index 和 Claude history 的存在性、条数与最新时间。" />
          ) : (
            <div className="health-list">
              {sourceChecks.map((check) => (
                <article key={check.id} className={`health-row ${check.status}`}>
                  <div>
                    <strong>{check.label}</strong>
                    <span>{labelByStatus[check.status]}</span>
                  </div>
                  <p>{check.detail}</p>
                  {check.suggestion ? <small>{check.suggestion}</small> : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

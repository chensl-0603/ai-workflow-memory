import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "../../empty-state";
import { AppNav } from "../../nav";
import { ExportProjectButton } from "../export-project-button";
import { GenerateKnowledgeSnapshotButton } from "../generate-knowledge-snapshot-button";
import { defaultConfig } from "../../../lib/paths.ts";
import { getProjectArchiveIndex } from "../../../lib/project-archives.ts";
import { getProjectDetail } from "../../../lib/project-detail.ts";
import { getLatestProjectPhaseReview } from "../../../lib/phase-reviews.ts";
import type { HealthTrendItem, ProjectKnowledgeSnapshot, ProjectPhaseReview } from "../../../lib/types.ts";

type PageParams = Promise<{
  name: string;
}>;

const labelByStatus = {
  ok: "正常",
  warn: "注意",
  fail: "阻塞"
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default async function ProjectDetailPage({ params }: { params: PageParams }) {
  const { name } = await params;
  const projectName = decodeURIComponent(name);
  const [detail, archiveIndex, latestPhaseReview] = await Promise.all([
    getProjectDetail(defaultConfig.dbPath, projectName),
    getProjectArchiveIndex({
      dbPath: defaultConfig.dbPath,
      obsidianVault: defaultConfig.obsidianVault
    }),
    getLatestProjectPhaseReview(defaultConfig.dbPath, projectName)
  ]);

  if (!detail) {
    notFound();
  }

  const warningHealth = detail.health.filter((check) => check.status !== "ok");
  const archiveItem = archiveIndex.items.find((item) => item.project.name === detail.project.name);
  const knowledgeSnapshot = archiveItem?.latestKnowledgeSnapshot ?? null;
  const manualNotes = archiveItem?.manualNotes.trim() ?? "";
  const manualSections = archiveItem?.manualSections;
  const hasStructuredNotes = Boolean(
    manualSections &&
      (manualSections.goals.length > 0 ||
        manualSections.decisions.length > 0 ||
        manualSections.blockers.length > 0 ||
        manualSections.notes.length > 0)
  );

  return (
    <>
      <AppNav />
      <main className="workspace">
        <header className="page-header project-detail-header">
          <div>
            <p className="eyebrow">Project Memory</p>
            <h1>{detail.project.name}</h1>
          </div>
          <div className="project-header-actions">
            <p>{detail.project.path}</p>
            <ExportProjectButton projectName={detail.project.name} />
          </div>
        </header>

        <section className="project-hero panel">
          <div>
            <span className="muted-label">技术栈</span>
            <strong>{detail.project.techStack.join(" / ")}</strong>
          </div>
          <div>
            <span className="muted-label">入口脚本</span>
            <strong>{detail.project.scripts.length > 0 ? detail.project.scripts.join("、") : "暂无脚本"}</strong>
          </div>
          <div>
            <span className="muted-label">仓库状态</span>
            <strong>{detail.project.hasGit ? "Git 项目" : "普通目录"}</strong>
          </div>
          <div>
            <span className="muted-label">最近更新</span>
            <strong>{formatDate(detail.project.updatedAt)}</strong>
          </div>
        </section>

        <div className="project-detail-grid">
          <section className="panel project-memory-panel">
            <div className="section-heading">
              <h2>关联记忆</h2>
              <Link href={`/memories?project=${encodeURIComponent(detail.project.name)}`}>检索</Link>
            </div>
            {detail.relatedTags.length > 0 ? (
              <div className="tag-row project-tags">
                {detail.relatedTags.map((tag) => (
                  <Link key={tag} href={`/memories?tag=${encodeURIComponent(tag)}`}>
                    {tag}
                  </Link>
                ))}
              </div>
            ) : null}
            {detail.memories.length === 0 ? (
              <EmptyState title="还没有关联记忆" detail="后续采集到带有项目路径的 Codex 或 Claude 对话后，这里会自动聚合。" />
            ) : (
              <ol className="memory-list">
                {detail.memories.map((item) => (
                  <li key={item.id}>
                    <div>
                      <span>{item.source === "codex" ? "Codex" : "Claude"}</span>
                      <time>{formatDate(item.occurredAt)}</time>
                    </div>
                    <strong>{item.title}</strong>
                    {item.projectPath ? <p>{item.projectPath}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <aside className="project-side-column">
          <section className="panel">
            <div className="section-heading">
              <h2>手动备注</h2>
                <span className="muted-label">{archiveItem?.archiveExists ? "Obsidian" : "未导出"}</span>
              </div>
              {hasStructuredNotes && manualSections ? (
                <div className="manual-section-grid">
                  <ManualSection title="目标" items={manualSections.goals} />
                  <ManualSection title="决策" items={manualSections.decisions} />
                  <ManualSection title="阻塞" items={manualSections.blockers} tone="warn" />
                  <ManualSection title="备注" items={manualSections.notes} />
                </div>
              ) : manualNotes ? (
                <pre className="manual-notes">{manualNotes}</pre>
              ) : (
                <EmptyState title="还没有手动备注" detail="导出项目档案后，可以在 Obsidian 的手动备注区补充目标、决策和上下文。" />
              )}
            </section>

            <section className="panel">
              <div className="section-heading">
                <h2>阶段快照</h2>
                <span className="muted-label">{knowledgeSnapshot ? formatDate(knowledgeSnapshot.capturedAt) : "未生成"}</span>
              </div>
              {knowledgeSnapshot ? (
                <KnowledgeSnapshotView snapshot={knowledgeSnapshot} stale={archiveItem?.knowledgeStale ?? false} />
              ) : (
                <EmptyState title="还没有阶段快照" detail="生成后会把已落地功能、当前架构、数据来源、测试信号和下一阶段路线写入 SQLite。" />
              )}
              <GenerateKnowledgeSnapshotButton projectName={detail.project.name} />
            </section>

            <section className="panel">
              <div className="section-heading">
                <h2>记忆覆盖风险</h2>
                <span className="muted-label">
                  {detail.memoryCoverage.status === "ok" ? "稳定" : detail.memoryCoverage.status === "warn" ? "注意" : "高风险"}
                </span>
              </div>
              <div className="manual-section-grid">
                <div className={`manual-section ${detail.memoryCoverage.status === "ok" ? "" : "warn"}`}>
                  <span className="muted-label">覆盖摘要</span>
                  <p>{detail.memoryCoverage.summary}</p>
                </div>
                <SnapshotList
                  title="覆盖指标"
                  items={[
                    `全部记忆：${detail.memoryCoverage.totalMemories}`,
                    `正文摘要：${detail.memoryCoverage.threadBodyMemories}`,
                    `标题兜底：${detail.memoryCoverage.titleFallbackMemories}`,
                    `人工摘要：${detail.memoryCoverage.manualMemories}`,
                    `源文件缺失：${detail.memoryCoverage.sourceMissingMemories}`
                  ]}
                />
                <SnapshotList title="建议" items={detail.memoryCoverage.suggestions} />
              </div>
            </section>

            <section className="panel">
              <div className="section-heading">
                <h2>阶段复盘</h2>
                <span className="muted-label">{latestPhaseReview ? formatDate(latestPhaseReview.completedAt) : "未生成"}</span>
              </div>
              {latestPhaseReview ? (
                <PhaseReviewView review={latestPhaseReview} />
              ) : (
                <EmptyState title="还没有阶段复盘" detail="完成小目标后生成复盘草稿，记录完成内容、验证命令、提交记录和下一步。" />
              )}
            </section>

            <section className="panel">
              <div className="section-heading">
                <h2>下一步建议</h2>
                <span className="muted-label">{detail.nextActions.length} 项</span>
              </div>
              <ol className="action-list">
                {detail.nextActions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ol>
            </section>

            <section className="panel">
              <div className="section-heading">
                <h2>环境提醒</h2>
                <Link href="/health">{warningHealth.length > 0 ? `${warningHealth.length} 个提醒` : "查看体检"}</Link>
              </div>
              {detail.healthTrend.items.length > 0 ? (
                <HealthTrendView items={detail.healthTrend.items} />
              ) : (
                <EmptyState title="暂无趋势记录" detail="运行多次采集后，这里会显示该项目最近环境状态变化。" />
              )}
              <div className="section-heading">
                <h2>当前状态</h2>
                <span className="muted-label">{detail.healthTrend.summary.repeatedAnomalies} 个反复异常</span>
              </div>
              {detail.health.length === 0 ? (
                <EmptyState title="暂无关联提醒" detail="环境检查结果正常，或暂时没有和该项目标签相关的体检项。" />
              ) : (
                <div className="health-list compact">
                  {detail.health.map((check) => (
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
          </aside>
        </div>
      </main>
    </>
  );
}

function HealthTrendView({ items }: { items: HealthTrendItem[] }) {
  return (
    <div className="manual-section-grid">
      {items.slice(0, 4).map((item) => (
        <div key={item.checkId} className={`manual-section ${item.repeated ? "warn" : ""}`}>
          <span className="muted-label">{item.repeated ? "反复异常" : labelByStatus[item.latestStatus]}</span>
          <p>{item.summary}</p>
          <ul>
            {item.recent.slice(0, 3).map((point) => (
              <li key={`${item.checkId}-${point.checkedAt}`}>
                {point.checkedAt.slice(0, 10)}：{labelByStatus[point.status]}，{point.detail}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function SnapshotList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="manual-section">
      <span className="muted-label">{title}</span>
      <ul>
        {items.slice(0, 4).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function KnowledgeSnapshotView({ snapshot, stale }: { snapshot: ProjectKnowledgeSnapshot; stale: boolean }) {
  return (
    <div className="manual-section-grid">
      <div className={`manual-section ${stale ? "warn" : ""}`}>
        <span className="muted-label">{stale ? "可能落后" : "最新摘要"}</span>
        <p>{snapshot.summary}</p>
      </div>
      <SnapshotList title="已落地" items={snapshot.shippedFeatures} />
      <SnapshotList title="当前架构" items={snapshot.currentArchitecture} />
      <SnapshotList title="已知缺口" items={snapshot.knownGaps} />
      <SnapshotList title="下一阶段" items={snapshot.nextMilestones} />
    </div>
  );
}

function PhaseReviewView({ review }: { review: ProjectPhaseReview }) {
  return (
    <div className="manual-section-grid">
      <div className="manual-section">
        <span className="muted-label">{review.milestone}</span>
        <p>{review.summary}</p>
      </div>
      <SnapshotList title="完成内容" items={review.completedItems} />
      <SnapshotList title="验证命令" items={review.verificationCommands} />
      <SnapshotList title="提交记录" items={review.commits.map((commit) => `${commit.hash} ${commit.message}`)} />
      <SnapshotList title="遗留问题" items={review.openIssues} />
      <SnapshotList title="下一步" items={review.nextSteps} />
    </div>
  );
}

function ManualSection({ title, items, tone = "idle" }: { title: string; items: string[]; tone?: "idle" | "warn" }) {
  if (items.length === 0) return null;
  return (
    <div className={`manual-section ${tone}`}>
      <span className="muted-label">{title}</span>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

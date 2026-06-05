import { EmptyState } from "../../empty-state";
import { AppNav } from "../../nav";
import {
  getArchiveCandidateAudit,
  getCleanupRuns,
  getIgnoredConversations,
  getKeptArchiveCandidates,
  getLatestCleanupRun,
  getMemoryQualityReport,
  getMemoryQualitySafetyPlan,
  getTitleFallbackReview
} from "../../../lib/memory-quality.ts";
import { defaultConfig, toDateKey } from "../../../lib/paths.ts";
import { CleanupArchiveCandidatesButton } from "./cleanup-archive-candidates-button";
import { ExportMemoryQualityButton } from "./export-memory-quality-button";
import { KeepArchiveCandidateButton } from "./keep-archive-candidate-button";
import { ManualSummaryForm, ResetManualSummaryButton } from "./manual-summary-form";
import { RestoreIgnoredConversationsButton } from "./restore-ignored-conversations-button";
import { RestoreIgnoredConversationButton } from "./restore-ignored-conversation-button";
import { UnkeepArchiveCandidateButton } from "./unkeep-archive-candidate-button";
import { UndoCleanupRunButton } from "./undo-cleanup-run-button";
import { UndoLatestCleanupButton } from "./undo-latest-cleanup-button";

export const dynamic = "force-dynamic";

export default async function MemoryQualityPage() {
  const report = await getMemoryQualityReport(defaultConfig.dbPath, { limit: Number.MAX_SAFE_INTEGER });
  const titleFallbackReview = await getTitleFallbackReview(defaultConfig.dbPath);
  const archiveAudit = await getArchiveCandidateAudit(defaultConfig.dbPath);
  const anomalies = report.items.filter((item) => item.status === "warn");
  const needsBody = report.items.filter((item) => item.status === "needs-body");
  const manualSummaryItems = report.items.filter((item) => item.summaryOrigin === "manual");
  const archiveCandidates = report.items.filter((item) => item.status === "archive-candidate");
  const codexArchiveCandidates = archiveCandidates.filter((item) => item.memory.source === "codex");
  const claudeArchiveCandidates = archiveCandidates.filter((item) => item.memory.source === "claude");
  const ignoredConversations = await getIgnoredConversations(defaultConfig.dbPath);
  const ignoredConversationCount = ignoredConversations.length;
  const latestCleanupRun = await getLatestCleanupRun(defaultConfig.dbPath);
  const cleanupRuns = await getCleanupRuns(defaultConfig.dbPath, { limit: 8 });
  const keptArchiveCandidates = await getKeptArchiveCandidates(defaultConfig.dbPath);
  const today = toDateKey(new Date());
  const safetyPlan = await getMemoryQualitySafetyPlan({
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
            <p className="eyebrow">Memory Quality</p>
            <h1>摘要质量</h1>
          </div>
          <div className="page-header-actions">
            <p>检查记忆摘要是否为空、未结构化、疑似混入上下文噪声，或仍然过长。</p>
            <ExportMemoryQualityButton />
          </div>
        </header>

        <section className="project-index-summary" aria-label="摘要质量概况">
          <div>
            <span>{report.summary.totalMemories}</span>
            <p>全部记忆</p>
          </div>
          <div>
            <span>{report.summary.healthyMemories}</span>
            <p>健康</p>
          </div>
          <div>
            <span>{report.summary.needsBodyMemories}</span>
            <p>待补正文</p>
          </div>
          <div>
            <span>{report.summary.archiveCandidateMemories}</span>
            <p>归档候选</p>
          </div>
          <div>
            <span>{report.summary.anomalyMemories}</span>
            <p>异常</p>
          </div>
          <div>
            <span>{report.summary.threadBodySummaries}</span>
            <p>正文摘要</p>
          </div>
          <div>
            <span>{report.summary.titleFallbackSummaries}</span>
            <p>标题兜底</p>
          </div>
          <div>
            <span>{report.summary.manualSummaries}</span>
            <p>人工摘要</p>
          </div>
          <div>
            <span>{report.summary.bodyBackedUpMemories}</span>
            <p>正文备份</p>
          </div>
          <div>
            <span>{report.summary.recoverableMemories}</span>
            <p>可补救</p>
          </div>
          <div>
            <span>{report.summary.sourceMissingMemories}</span>
            <p>源缺失</p>
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>安全操作台</h2>
              <p className="section-detail">{safetyPlan.summary}</p>
            </div>
            <span className="muted-label">{safetyPlan.nextStepId ? "有下一步" : "已收口"}</span>
          </div>
          <div className="safety-plan-metrics" aria-label="质量治理安全指标">
            <div>
              <span>{safetyPlan.metrics.archiveCandidates}</span>
              <p>候选</p>
            </div>
            <div>
              <span>{safetyPlan.metrics.keptArchiveCandidates}</span>
              <p>保留</p>
            </div>
            <div>
              <span>{safetyPlan.metrics.ignoredConversations}</span>
              <p>忽略</p>
            </div>
            <div>
              <span>{safetyPlan.metrics.activeCleanupRuns}</span>
              <p>可撤销</p>
            </div>
            <div>
              <span>{safetyPlan.metrics.auditExportedToday ? "是" : "否"}</span>
              <p>今日审计</p>
            </div>
          </div>
          <ol className="safety-plan-list">
            {safetyPlan.steps.map((step) => (
              <li className={step.status} key={step.id}>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.detail}</p>
                </div>
                <span>{step.status === "done" ? "完成" : step.status === "ready" ? "下一步" : "等待"}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="panel">
          <div className="section-heading">
            <h2>归档候选</h2>
            <div className="section-actions">
              <span className="muted-label">{archiveCandidates.length} 条</span>
              <div className="quality-cleanup-actions">
                <CleanupArchiveCandidatesButton count={archiveCandidates.length} label="清理全部" />
                <CleanupArchiveCandidatesButton count={codexArchiveCandidates.length} label={`Codex ${codexArchiveCandidates.length}`} source="codex" />
                <CleanupArchiveCandidatesButton count={claudeArchiveCandidates.length} label={`Claude ${claudeArchiveCandidates.length}`} source="claude" />
              </div>
            </div>
          </div>
          {archiveCandidates.length === 0 ? (
            <EmptyState title="没有低价值记忆" detail="当前抽样里没有纯命令或短问候记录。" />
          ) : (
            <>
              <div className="archive-audit-summary" aria-label="归档候选审计概况">
                <div>
                  <span>{archiveAudit.summary.codexCandidates}</span>
                  <p>Codex</p>
                </div>
                <div>
                  <span>{archiveAudit.summary.claudeCandidates}</span>
                  <p>Claude</p>
                </div>
                <div>
                  <span>{archiveAudit.summary.commandCandidates}</span>
                  <p>命令类</p>
                </div>
                <div>
                  <span>{archiveAudit.summary.greetingCandidates}</span>
                  <p>问候类</p>
                </div>
                <div>
                  <span>{archiveAudit.summary.threadBodyCandidates}</span>
                  <p>正文摘要</p>
                </div>
                <div>
                  <span>{archiveAudit.summary.titleFallbackCandidates}</span>
                  <p>标题兜底</p>
                </div>
                <div>
                  <span>{archiveAudit.summary.linkedProjectCandidates}</span>
                  <p>已有项目</p>
                </div>
                <div>
                  <span>{archiveAudit.summary.unlinkedProjectCandidates}</span>
                  <p>无项目</p>
                </div>
              </div>
              <div className="archive-group-list" aria-label="归档候选分组">
                {archiveAudit.groups.slice(0, 8).map((group) => (
                  <article key={group.key}>
                    <div className="archive-group-main">
                      <div>
                        <span>{group.candidateKindLabel}</span>
                        <span>{group.source === "codex" ? "Codex" : "Claude"}</span>
                        <span>{group.summaryOrigin === "title-fallback" ? "标题兜底" : group.summaryOrigin === "manual" ? "人工摘要" : "正文摘要"}</span>
                        <span>{group.projectName}</span>
                      </div>
                      <CleanupArchiveCandidatesButton
                        count={group.count}
                        label={`清理此组 ${group.count}`}
                        source={group.source}
                        summaryOrigin={group.summaryOrigin}
                        candidateKind={group.candidateKind}
                        projectName={group.projectName}
                      />
                    </div>
                    <strong>{group.count} 条</strong>
                    <p>{group.sampleTitles.join("、")}</p>
                  </article>
                ))}
              </div>
              <ol className="memory-quality-list compact">
                {archiveAudit.items.slice(0, 20).map((item) => (
                  <li key={item.memory.id}>
                    <div className="quality-row-head">
                      <div>
                        <span>{item.memory.source === "codex" ? "Codex" : "Claude"}</span>
                        <span>{item.candidateKindLabel}</span>
                        <span>{item.summaryOrigin === "title-fallback" ? "标题兜底" : item.summaryOrigin === "manual" ? "人工摘要" : "正文摘要"}</span>
                        <span>{item.projectName}</span>
                        <time>{new Date(item.memory.occurredAt).toLocaleString("zh-CN")}</time>
                      </div>
                      <strong>{item.memory.title}</strong>
                    </div>
                    <KeepArchiveCandidateButton id={item.memory.id} title={item.memory.title} />
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>已忽略记忆</h2>
              <p className="section-detail">清理归档候选后，这里保留墓碑，防止低价值记录在下次采集时重新进入记忆流。</p>
            </div>
            <div className="section-actions">
              <span className="muted-label">{ignoredConversationCount} 条</span>
              <UndoLatestCleanupButton disabled={!latestCleanupRun} />
              <RestoreIgnoredConversationsButton count={ignoredConversationCount} />
            </div>
          </div>
          {latestCleanupRun ? (
            <div className="cleanup-run-callout">
              <div>
                <span>最近清理批次</span>
                <strong>{latestCleanupRun.deletedCount} 条</strong>
              </div>
              <p>
                {latestCleanupRun.filterLabel} · {new Date(latestCleanupRun.createdAt).toLocaleString("zh-CN")}
              </p>
            </div>
          ) : null}
          {ignoredConversations.length === 0 ? (
            <EmptyState title="没有已忽略记忆" detail="执行候选清理后，可以在这里逐条恢复或全部恢复。" />
          ) : (
            <ol className="memory-quality-list compact">
              {ignoredConversations.slice(0, 20).map((item) => (
                <li className="ignored-memory-row" key={item.id}>
                  <div className="quality-row-head">
                    <div>
                      <span>{item.source === "codex" ? "Codex" : item.source === "claude" ? "Claude" : "Memory"}</span>
                      <time>{new Date(item.ignoredAt).toLocaleString("zh-CN")}</time>
                    </div>
                    <strong>{item.title || item.id}</strong>
                  </div>
                  <RestoreIgnoredConversationButton id={item.id} />
                </li>
              ))}
            </ol>
          )}
          <div className="cleanup-run-history">
            <div className="section-heading compact">
              <h3>清理批次</h3>
              <span className="muted-label">{cleanupRuns.length} 条</span>
            </div>
            {cleanupRuns.length === 0 ? (
              <EmptyState title="还没有清理批次" detail="执行归档候选清理后，这里会记录每次清理的范围和撤销状态。" />
            ) : (
              <ol>
                {cleanupRuns.map((run) => (
                  <li key={run.id}>
                    <div>
                      <strong>{run.filterLabel}</strong>
                      <p>
                        删除 {run.deletedCount} 条 · 忽略 {run.ignoredCount} 条 · {new Date(run.createdAt).toLocaleString("zh-CN")}
                      </p>
                    </div>
                    <span className={run.undoneAt ? "cleanup-run-status undone" : "cleanup-run-status"}>{run.undoneAt ? "已撤销" : "可撤销"}</span>
                    <UndoCleanupRunButton cleanupRunId={run.id} disabled={Boolean(run.undoneAt)} />
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>已保留候选</h2>
              <p className="section-detail">这些低价值形态的记忆已被人工确认保留，不会被归档候选清理命中。</p>
            </div>
            <span className="muted-label">{keptArchiveCandidates.length} 条</span>
          </div>
          {keptArchiveCandidates.length === 0 ? (
            <EmptyState title="没有已保留候选" detail="在归档候选里点“保留”后，会在这里集中管理。" />
          ) : (
            <ol className="memory-quality-list compact">
              {keptArchiveCandidates.slice(0, 20).map((item) => (
                <li className="ignored-memory-row" key={item.id}>
                  <div className="quality-row-head">
                    <div>
                      <span>{item.source === "codex" ? "Codex" : item.source === "claude" ? "Claude" : "Memory"}</span>
                      <time>{new Date(item.keptAt).toLocaleString("zh-CN")}</time>
                    </div>
                    <strong>{item.title || item.id}</strong>
                  </div>
                  <UnkeepArchiveCandidateButton id={item.id} />
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="panel">
          <div className="section-heading">
            <h2>待补正文</h2>
            <span className="muted-label">{needsBody.length} 条</span>
          </div>
          {needsBody.length === 0 ? (
            <EmptyState title="没有标题级兜底摘要" detail="当前抽样中的摘要都来自线程正文或更完整的结构化采集。" />
          ) : (
            <ol className="memory-quality-list compact">
              {needsBody.slice(0, 20).map((item) => (
                <li key={item.memory.id}>
                  <div className="quality-row-head">
                    <div>
                      <span>{item.memory.source === "codex" ? "Codex" : "Claude"}</span>
                      <span>{item.recoverability.label}</span>
                      <time>{new Date(item.memory.occurredAt).toLocaleString("zh-CN")}</time>
                    </div>
                    <strong>{item.memory.title}</strong>
                  </div>
                  <p className="section-detail">{item.recoverability.detail}</p>
                  <p className="memory-summary">{item.memory.summary}</p>
                  {item.recoverability.suggestion ? <p className="section-detail">{item.recoverability.suggestion}</p> : null}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>标题兜底</h2>
              <p className="section-detail">这些记忆只有标题级摘要。先看诊断原因，再决定人工补摘要还是归档。</p>
            </div>
            <div className="section-actions">
              <span className="muted-label">{titleFallbackReview.summary.totalFallbacks} 条</span>
              <CleanupArchiveCandidatesButton
                count={titleFallbackReview.summary.archiveCandidates}
                label={`清理兜底候选 ${titleFallbackReview.summary.archiveCandidates}`}
                summaryOrigin="title-fallback"
              />
            </div>
          </div>
          <div className="fallback-review-summary" aria-label="标题兜底诊断概况">
            <div>
              <span>{titleFallbackReview.summary.manualSummaryCandidates}</span>
              <p>建议补摘要</p>
            </div>
            <div>
              <span>{titleFallbackReview.summary.archiveCandidates}</span>
              <p>建议归档</p>
            </div>
            <div>
              <span>{titleFallbackReview.summary.missingProjectLinks}</span>
              <p>缺项目关联</p>
            </div>
            <div>
              <span>{titleFallbackReview.summary.projectLinkedFallbacks}</span>
              <p>已有项目</p>
            </div>
          </div>
          {titleFallbackReview.items.length === 0 ? (
            <EmptyState title="没有标题兜底记忆" detail="当前所有可见记忆都有正文摘要或人工摘要。" />
          ) : (
            <ol className="memory-quality-list">
              {titleFallbackReview.items.slice(0, 20).map((diagnostic) => (
                <li key={diagnostic.memory.id}>
                  <div className="quality-row-head">
                    <div>
                      <span>{diagnostic.memory.source === "codex" ? "Codex" : "Claude"}</span>
                      <span>{diagnostic.reasonLabel}</span>
                      <span>{diagnostic.actionLabel}</span>
                      <time>{new Date(diagnostic.memory.occurredAt).toLocaleString("zh-CN")}</time>
                    </div>
                    <strong>{diagnostic.memory.title}</strong>
                  </div>
                  <p className="section-detail">{diagnostic.detail}</p>
                  {diagnostic.suggestedAction === "manual-summary" ? (
                    <ManualSummaryForm id={diagnostic.memory.id} initialSummary={diagnostic.memory.summary} />
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>人工摘要</h2>
              <p className="section-detail">这些记忆已由人工摘要接管。确认不再需要人工锁定时，可以交回采集器。</p>
            </div>
            <span className="muted-label">{manualSummaryItems.length} 条</span>
          </div>
          {manualSummaryItems.length === 0 ? (
            <EmptyState title="没有人工摘要" detail="手动校正标题兜底记忆后，会在这里集中管理。" />
          ) : (
            <ol className="memory-quality-list">
              {manualSummaryItems.slice(0, 20).map((item) => (
                <li key={item.memory.id}>
                  <div className="quality-row-head">
                    <div>
                      <span>{item.memory.source === "codex" ? "Codex" : "Claude"}</span>
                      <time>{new Date(item.memory.occurredAt).toLocaleString("zh-CN")}</time>
                    </div>
                    <strong>{item.memory.title}</strong>
                  </div>
                  <p className="memory-summary">{item.memory.summary}</p>
                  <ResetManualSummaryButton id={item.memory.id} />
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="panel">
          <div className="section-heading">
            <h2>异常摘要</h2>
            <span className="muted-label">全量检查</span>
          </div>
          {anomalies.length === 0 ? (
            <EmptyState title="暂未发现摘要异常" detail="当前抽样里的记忆摘要都有基本结构，也没有命中已知噪声规则。" />
          ) : (
            <ol className="memory-quality-list">
              {anomalies.map((item) => (
                <li key={item.memory.id}>
                  <div className="quality-row-head">
                    <div>
                      <span>{item.memory.source === "codex" ? "Codex" : "Claude"}</span>
                      <time>{new Date(item.memory.occurredAt).toLocaleString("zh-CN")}</time>
                    </div>
                    <strong>{item.memory.title}</strong>
                  </div>
                  {item.memory.summary ? <p className="memory-summary">{item.memory.summary}</p> : null}
                  <div className="quality-issue-row">
                    {item.issues.map((issue) => (
                      <span key={issue.kind} title={issue.detail}>
                        {issue.label}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
    </>
  );
}

import { appendFile, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { ingestAllSources } from "../lib/ingest.ts";
import { getDailyReview } from "../lib/review.ts";
import {
  exportActionInboxToObsidian,
  exportDailyReviewToObsidian,
  exportMemoryQualityAuditToObsidian,
  exportProjectArchiveToObsidian,
  exportStrategyBoardToObsidian
} from "../lib/obsidian.ts";
import { scanProjects } from "../lib/projects.ts";
import { buildProjectHealthOptions, runHealthChecks } from "../lib/health.ts";
import { searchMemories } from "../lib/search.ts";
import { getProjectDetail } from "../lib/project-detail.ts";
import { cleanupDeletedProjectMemories } from "../lib/cleanup.ts";
import { exportAllProjectArchives, getProjectArchiveIndex, parseProjectManualNotes, readProjectManualNotes } from "../lib/project-archives.ts";
import { getDecisionTimeline } from "../lib/decisions.ts";
import { getBlockerBoard } from "../lib/blockers.ts";
import { getDailyActions } from "../lib/daily-actions.ts";
import { getDailyPayload } from "../lib/daily-payload.ts";
import { getReviewHistory } from "../lib/review-history.ts";
import { setDailyActionStatus } from "../lib/action-status.ts";
import { getActionInbox } from "../lib/action-inbox.ts";
import {
  cleanupArchiveCandidateMemories,
  getArchiveCandidateAudit,
  getCleanupRuns,
  getIgnoredConversationCount,
  getIgnoredConversations,
  getLatestCleanupRun,
  getKeptArchiveCandidates,
  getMemoryQualitySafetyPlan,
  getMemoryQualityReport,
  getTitleFallbackReview,
  keepArchiveCandidate,
  previewArchiveCandidateCleanup,
  resetManualMemorySummary,
  saveManualMemorySummary,
  unkeepArchiveCandidate,
  undoCleanupRun,
  undoLatestCleanupRun,
  restoreIgnoredConversation,
  restoreIgnoredConversations
} from "../lib/memory-quality.ts";
import { toDateKey } from "../lib/paths.ts";
import { getGoalBoard } from "../lib/goals.ts";
import { getStrategyBoard } from "../lib/strategy.ts";
import { diagnoseSyncFailure, getRecentSyncRuns, getSyncAudit, getSyncSnapshots, getSyncStatus, syncObsidian } from "../lib/sync.ts";
import { getInitialSyncControlState, getRetryableSyncRunId } from "../lib/sync-console-state.ts";
import { ensureDatabase } from "../lib/db.ts";
import { getSourceHealthReport } from "../lib/source-health.ts";
import { generateProjectKnowledgeSnapshot, getLatestProjectKnowledgeSnapshot } from "../lib/project-knowledge.ts";

function assertCleanupResult(
  actual: { cleanupRunId: string | null; ignoredConversations: number; deletedConversations: number },
  expected: { ignoredConversations: number; deletedConversations: number }
) {
  assert.equal(actual.ignoredConversations, expected.ignoredConversations);
  assert.equal(actual.deletedConversations, expected.deletedConversations);
  assert.equal(
    expected.ignoredConversations > 0 || expected.deletedConversations > 0 ? typeof actual.cleanupRunId : actual.cleanupRunId,
    expected.ignoredConversations > 0 || expected.deletedConversations > 0 ? "string" : null
  );
}

async function makeFixtureDir() {
  const root = await mkdtemp(path.join(tmpdir(), "ai-memory-"));
  const codexDir = path.join(root, "codex");
  const claudeDir = path.join(root, "claude");
  const claudeProjectsDir = path.join(claudeDir, "projects");
  const projectsDir = path.join(root, "projects");
  const vaultDir = path.join(root, "vault");
  await Promise.all([
    mkdir(codexDir, { recursive: true }),
    mkdir(claudeProjectsDir, { recursive: true }),
    mkdir(projectsDir, { recursive: true }),
    mkdir(vaultDir, { recursive: true })
  ]);

  await writeFile(
    path.join(codexDir, "session_index.jsonl"),
    [
      JSON.stringify({
        id: "codex-1",
        thread_name: "优化首页天气新闻GitHub卡片",
        updated_at: "2026-05-30T08:30:00Z"
      }),
      JSON.stringify({
        id: "codex-2",
        thread_name: "GitHub OAuth App 本地和公网回调配置",
        updated_at: "2026-05-29T08:20:00Z"
      }),
      JSON.stringify({
        id: "codex-1",
        thread_name: "优化首页天气新闻GitHub卡片",
        updated_at: "2026-05-30T08:30:00Z"
      })
    ].join("\n")
  );

  const nextProject = path.join(projectsDir, "hotspot-hub");
  const mavenProject = path.join(projectsDir, "FarmGame");
  const plainProject = path.join(projectsDir, "notes");
  await Promise.all([
    mkdir(path.join(nextProject, ".git"), { recursive: true }),
    mkdir(mavenProject, { recursive: true }),
    mkdir(plainProject, { recursive: true })
  ]);
  await writeFile(
    path.join(nextProject, "package.json"),
    JSON.stringify({ scripts: { dev: "next dev -p 31000", build: "next build" } })
  );
  await writeFile(path.join(mavenProject, "pom.xml"), "<project />");

  const codexSessionDir = path.join(codexDir, "sessions", "2026", "05", "30");
  await mkdir(codexSessionDir, { recursive: true });
  await writeFile(
    path.join(codexSessionDir, "rollout-2026-05-30T08-30-00-codex-1.jsonl"),
    [
      JSON.stringify({
        type: "session_meta",
        timestamp: "2026-05-30T08:30:00Z",
        payload: {
          id: "codex-1",
          cwd: nextProject
        }
      }),
      JSON.stringify({
        type: "response_item",
        timestamp: "2026-05-30T08:31:00Z",
        payload: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: "# AGENTS.md instructions for D:/Project/hotspot-hub Always respond in Chinese. <goal_context>Continue working toward the active thread goal.</goal_context>"
            }
          ]
        }
      }),
      JSON.stringify({
        type: "response_item",
        timestamp: "2026-05-30T08:31:20Z",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "请把天气卡片接入 drizzle-cache 关键词。" }]
        }
      }),
      JSON.stringify({
        type: "response_item",
        timestamp: "2026-05-30T08:31:30Z",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "[external_agent_tool_call: Agent] description: 后台代理扫描 [/external_agent_tool_call]" }]
        }
      }),
      JSON.stringify({
        type: "response_item",
        timestamp: "2026-05-30T08:31:40Z",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "[external_agent_tool_result: Agent] 第一次工具结果 [/external_agent_tool_result]" }]
        }
      }),
      JSON.stringify({
        type: "response_item",
        timestamp: "2026-05-30T08:31:50Z",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "[external_agent_tool_call: Agent] description: 第二次扫描 [/external_agent_tool_call]" }]
        }
      }),
      JSON.stringify({
        type: "response_item",
        timestamp: "2026-05-30T08:31:55Z",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "[external_agent_tool_result: Agent] 第二次工具结果 [/external_agent_tool_result]" }]
        }
      }),
      JSON.stringify({
        type: "response_item",
        timestamp: "2026-05-30T08:31:57Z",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "[external_agent_tool_call: Agent] description: 第三次扫描 [/external_agent_tool_call]" }]
        }
      }),
      JSON.stringify({
        type: "response_item",
        timestamp: "2026-05-30T08:31:59Z",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "[external_agent_tool_result: Agent] 第三次工具结果 [/external_agent_tool_result]" }]
        }
      }),
      JSON.stringify({
        type: "response_item",
        timestamp: "2026-05-30T08:32:00Z",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "已把摘要写进首页卡片，并保留刷新入口。" }]
        }
      })
    ].join("\n")
  );

  await writeFile(
    path.join(claudeDir, "history.jsonl"),
    [
      JSON.stringify({
        display: "阅读 FIX-PLAN.md 修复页面布局",
        timestamp: Date.parse("2026-05-30T09:00:00Z"),
        project: nextProject,
        sessionId: "claude-1"
      }),
      JSON.stringify({
        display: "JAVA_HOME is not set，检查 Gradle 构建环境",
        timestamp: Date.parse("2026-05-28T09:00:00Z"),
        project: mavenProject,
        sessionId: "claude-2"
      }),
      "{bad json"
    ].join("\n")
  );
  const claudeSessionDir = path.join(claudeProjectsDir, "fixture-project");
  await mkdir(claudeSessionDir, { recursive: true });
  await writeFile(
    path.join(claudeSessionDir, "claude-2.jsonl"),
    [
      JSON.stringify({
        type: "user",
        timestamp: "2026-05-28T09:00:00Z",
        sessionId: "claude-2",
        cwd: mavenProject,
        message: {
          role: "user",
          content: "请定位 JAVA_HOME 和 Gradle 构建阻塞。"
        }
      }),
      JSON.stringify({
        type: "assistant",
        timestamp: "2026-05-28T09:02:00Z",
        sessionId: "claude-2",
        cwd: mavenProject,
        message: {
          role: "assistant",
          content: [{ type: "text", text: "已确认 wrapper 缺失，先补环境变量检查。" }]
        }
      })
    ].join("\n")
  );

  return {
    root,
    dbPath: path.join(root, "memory.sqlite"),
    codexIndexPath: path.join(codexDir, "session_index.jsonl"),
    claudeHistoryPath: path.join(claudeDir, "history.jsonl"),
    claudeProjectsRoot: claudeProjectsDir,
    projectsRoot: projectsDir,
    obsidianVault: vaultDir
  };
}

test("ingests Codex, Claude, and project snapshots without duplicates", async () => {
  const fixture = await makeFixtureDir();
  try {
    const first = await ingestAllSources(fixture);
    const second = await ingestAllSources(fixture);
    const review = await getDailyReview(fixture.dbPath, "2026-05-30");

    assert.equal(first.conversations, 4);
    assert.equal(second.conversations, 0);
    assert.equal(review.conversations.length, 2);
    assert.equal(review.projects.length, 3);
    assert.match(review.summary, /2 条对话/);
    assert.match(review.summary, /3 个项目/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("records source index health during ingest", async () => {
  const fixture = await makeFixtureDir();
  try {
    const result = await ingestAllSources(fixture);
    const report = await getSourceHealthReport(fixture.dbPath);
    const bySource = new Map(report.items.map((item) => [item.source, item]));

    assert.equal(result.sources, 2);
    assert.equal(report.summary.totalSources, 2);
    assert.equal(report.summary.missingSources, 0);
    assert.equal(bySource.get("codex")?.exists, true);
    assert.equal(bySource.get("codex")?.itemCount, 3);
    assert.equal(bySource.get("codex")?.latestUpdatedAt, new Date(Date.parse("2026-05-30T08:30:00Z")).toISOString());
    assert.match(bySource.get("codex")?.detail ?? "", /session_index\.jsonl/);
    assert.equal(bySource.get("claude")?.exists, true);
    assert.equal(bySource.get("claude")?.itemCount, 2);
    assert.equal(bySource.get("claude")?.latestUpdatedAt, new Date(Date.parse("2026-05-30T09:00:00Z")).toISOString());
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("builds date keys in Asia Shanghai local day instead of UTC day", () => {
  assert.equal(toDateKey("2026-05-31T16:30:00.000Z"), "2026-06-01");
  assert.equal(toDateKey("2026-06-01T01:30:00+08:00"), "2026-06-01");
  assert.equal(toDateKey("2026-06-01"), "2026-06-01");
});

test("tags memories and searches across dates by query, source, project, and tag", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);

    const frontend = await searchMemories(fixture.dbPath, { tag: "前端" });
    assert.equal(frontend.items.length, 2);
    assert.ok(frontend.availableTags.includes("Agent"));
    assert.ok(frontend.availableTags.includes("OAuth"));
    assert.ok(frontend.availableTags.includes("前端"));
    assert.ok(frontend.availableTags.includes("构建"));
    assert.ok(frontend.items.every((item) => item.tags.includes("前端")));

    const oauth = await searchMemories(fixture.dbPath, { query: "OAuth", source: "codex" });
    assert.equal(oauth.items.length, 1);
    assert.equal(oauth.items[0]?.title, "GitHub OAuth App 本地和公网回调配置");
    assert.deepEqual(new Set(oauth.items[0]?.tags), new Set(["Agent", "GitHub", "OAuth", "部署"]));

    const codexBody = await searchMemories(fixture.dbPath, { query: "drizzle-cache", source: "codex" });
    assert.equal(codexBody.items.length, 1);
    assert.equal(codexBody.items[0]?.projectPath, path.join(fixture.projectsRoot, "hotspot-hub"));
    assert.match(codexBody.items[0]?.summary ?? "", /目标：请把天气卡片接入 drizzle-cache 关键词。/);
    assert.doesNotMatch(codexBody.items[0]?.summary ?? "", /AGENTS|goal_context/);
    assert.match(codexBody.items[0]?.summary ?? "", /进展：已把摘要写进首页卡片，并保留刷新入口。/);
    assert.doesNotMatch(codexBody.items[0]?.summary ?? "", /external_agent_tool_call/);
    assert.doesNotMatch(codexBody.items[0]?.summary ?? "", /external_agent_tool_result/);
    assert.match(codexBody.items[0]?.summary ?? "", /线索：drizzle-cache/);

    const project = await searchMemories(fixture.dbPath, { project: "FarmGame" });
    assert.equal(project.items.length, 1);
    assert.ok(project.items[0]?.tags.includes("构建"));
    assert.ok(project.items[0]?.tags.includes("环境"));
    assert.match(project.items[0]?.summary ?? "", /目标：请定位 JAVA_HOME 和 Gradle 构建阻塞。/);
    assert.match(project.items[0]?.summary ?? "", /进展：已确认 wrapper 缺失，先补环境变量检查。/);
    assert.match(project.items[0]?.summary ?? "", /线索：JAVA_HOME、Gradle、wrapper/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("scores memory summary quality and reports anomalies", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);
    const db = await ensureDatabase(fixture.dbPath);
    db.prepare(
      `INSERT INTO conversations
       (id, source, title, summary, project_path, occurred_at, raw_ref, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "codex:codex-command",
      "codex",
      "<command-name>/model</command-name>",
      "目标：<command-name>/model</command-name>\n进展：仅标题索引，待补正文。",
      null,
      "2026-05-29T07:20:00Z",
      "codex-command",
      "[]"
    );
    db.prepare(
      `INSERT INTO conversations
       (id, source, title, summary, project_path, occurred_at, raw_ref, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "claude:claude-greeting:1779872400000",
      "claude",
      "你好",
      "目标：你好\n进展：仅标题索引，待补正文。",
      null,
      "2026-05-27T09:00:00Z",
      "claude-greeting",
      "[]"
    );
    db.close();

    const report = await getMemoryQualityReport(fixture.dbPath, { limit: 20 });
    const byId = new Map(report.items.map((item) => [item.memory.id, item]));

    assert.equal(report.summary.totalMemories, 6);
    assert.equal(report.summary.healthyMemories, 2);
    assert.equal(report.summary.needsBodyMemories, 2);
    assert.equal(report.summary.archiveCandidateMemories, 2);
    assert.equal(report.summary.anomalyMemories, 0);
    assert.equal(report.summary.threadBodySummaries, 2);
    assert.equal(report.summary.titleFallbackSummaries, 4);
    assert.equal(report.summary.emptySummary, 0);
    assert.equal(report.summary.unstructuredSummary, 0);
    assert.equal(report.summary.noisySummary, 0);
    assert.equal(report.summary.longSummary, 0);

    assert.equal(byId.get("codex:codex-1")?.status, "ok");
    assert.equal(byId.get("codex:codex-1")?.summaryOrigin, "thread-body");
    assert.equal(byId.get("codex:codex-1")?.issues.length, 0);
    assert.match(byId.get("codex:codex-2")?.memory.summary ?? "", /仅标题索引，待补正文。/);
    assert.equal(byId.get("codex:codex-2")?.status, "needs-body");
    assert.equal(byId.get("codex:codex-2")?.summaryOrigin, "title-fallback");
    assert.deepEqual(byId.get("codex:codex-2")?.issues.map((issue) => issue.kind), []);
    assert.equal(byId.get("claude:claude-2:1779958800000")?.status, "ok");
    assert.deepEqual(byId.get("claude:claude-2:1779958800000")?.issues.map((issue) => issue.kind), []);
    assert.equal(byId.get("codex:codex-command")?.status, "archive-candidate");
    assert.equal(byId.get("codex:codex-command")?.summaryOrigin, "title-fallback");
    assert.equal(byId.get("claude:claude-greeting:1779872400000")?.status, "archive-candidate");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("keeps manually corrected memory summaries across later ingest runs", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);

    const saved = await saveManualMemorySummary(fixture.dbPath, {
      id: "codex:codex-2",
      summary: "目标：保留 GitHub OAuth 回调配置。\n进展：已人工整理本地和公网回调差异。\n线索：GitHub、OAuth、回调"
    });
    await ingestAllSources(fixture);
    const report = await getMemoryQualityReport(fixture.dbPath, { limit: 20 });
    const corrected = report.items.find((item) => item.memory.id === "codex:codex-2");

    assert.deepEqual(saved, { updated: true });
    assert.equal(corrected?.summaryOrigin, "manual");
    assert.equal(corrected?.status, "ok");
    assert.match(corrected?.memory.summary ?? "", /人工整理本地和公网回调差异/);
    assert.doesNotMatch(corrected?.memory.summary ?? "", /仅标题索引/);
    assert.equal(report.summary.manualSummaries, 1);
    assert.equal(report.summary.titleFallbackSummaries, 1);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("releases a manual memory summary so later ingest can restore the automatic thread summary", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);
    await saveManualMemorySummary(fixture.dbPath, {
      id: "codex:codex-1",
      summary: "目标：临时人工摘要。\n进展：这条内容应该在撤回后交回采集器。\n线索：manual"
    });

    const reset = await resetManualMemorySummary(fixture.dbPath, { id: "codex:codex-1" });
    await ingestAllSources(fixture);
    const report = await getMemoryQualityReport(fixture.dbPath, { limit: 20 });
    const restored = report.items.find((item) => item.memory.id === "codex:codex-1");

    assert.deepEqual(reset, { updated: true });
    assert.equal(restored?.summaryOrigin, "thread-body");
    assert.match(restored?.memory.summary ?? "", /目标：请把天气卡片接入 drizzle-cache 关键词。/);
    assert.doesNotMatch(restored?.memory.summary ?? "", /临时人工摘要/);
    assert.equal(report.summary.manualSummaries, 0);
    assert.equal(report.summary.threadBodySummaries, 2);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("diagnoses title fallback memories with suggested next actions", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);
    const db = await ensureDatabase(fixture.dbPath);
    db.prepare(
      `INSERT INTO conversations
       (id, source, title, summary, summary_origin, project_path, occurred_at, raw_ref, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "codex:codex-command",
      "codex",
      "<command-name>/model</command-name>",
      "目标：<command-name>/model</command-name>\n进展：仅标题索引，待补正文。",
      "title-fallback",
      null,
      "2026-05-29T07:20:00Z",
      "codex-command",
      "[]"
    );
    db.close();

    const review = await getTitleFallbackReview(fixture.dbPath);
    const byId = new Map(review.items.map((item) => [item.memory.id, item]));

    assert.equal(review.summary.totalFallbacks, 3);
    assert.equal(review.summary.archiveCandidates, 1);
    assert.equal(review.summary.manualSummaryCandidates, 2);
    assert.equal(review.summary.missingProjectLinks, 2);
    assert.equal(review.summary.projectLinkedFallbacks, 1);
    assert.equal(byId.get("codex:codex-command")?.reason, "archive-candidate");
    assert.equal(byId.get("codex:codex-command")?.suggestedAction, "archive");
    assert.equal(byId.get("codex:codex-2")?.reason, "missing-project-link");
    assert.equal(byId.get("codex:codex-2")?.suggestedAction, "manual-summary");
    assert.equal(
      review.items.find((item) => item.memory.title === "阅读 FIX-PLAN.md 修复页面布局")?.reason,
      "missing-thread-body"
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("cleans archive candidate memories without allowing later ingest to restore them", async () => {
  const fixture = await makeFixtureDir();
  try {
    await appendFile(
      fixture.codexIndexPath,
      `\n${JSON.stringify({
        id: "codex-command",
        thread_name: "<command-name>/model</command-name>",
        updated_at: "2026-05-29T07:20:00Z"
      })}`
    );
    await ingestAllSources(fixture);
    const db = await ensureDatabase(fixture.dbPath);
    db.prepare(
      `INSERT INTO conversations
       (id, source, title, summary, project_path, occurred_at, raw_ref, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "claude:claude-greeting:1779872400000",
      "claude",
      "你好",
      "目标：你好\n进展：仅标题索引，待补正文。",
      null,
      "2026-05-27T09:00:00Z",
      "claude-greeting",
      "[]"
    );
    db.close();

    const cleaned = await cleanupArchiveCandidateMemories(fixture.dbPath);
    const afterCleanup = await getMemoryQualityReport(fixture.dbPath, { limit: 20 });
    const second = await cleanupArchiveCandidateMemories(fixture.dbPath);
    const ingest = await ingestAllSources(fixture);
    const afterIngest = await getMemoryQualityReport(fixture.dbPath, { limit: 20 });

    assertCleanupResult(cleaned, {
      ignoredConversations: 2,
      deletedConversations: 2
    });
    assert.equal(afterCleanup.summary.totalMemories, 4);
    assert.equal(afterCleanup.summary.archiveCandidateMemories, 0);
    assertCleanupResult(second, {
      ignoredConversations: 0,
      deletedConversations: 0
    });
    assert.equal(ingest.skippedIgnoredConversations, 1);
    assert.equal(afterIngest.summary.totalMemories, 4);
    assert.equal(afterIngest.summary.archiveCandidateMemories, 0);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("restores ignored conversation tombstones so a later ingest can import memories again", async () => {
  const fixture = await makeFixtureDir();
  try {
    await appendFile(
      fixture.codexIndexPath,
      `\n${JSON.stringify({
        id: "codex-command",
        thread_name: "<command-name>/model</command-name>",
        updated_at: "2026-05-29T07:20:00Z"
      })}`
    );
    await ingestAllSources(fixture);
    await cleanupArchiveCandidateMemories(fixture.dbPath);

    assert.equal(await getIgnoredConversationCount(fixture.dbPath), 1);
    assert.notEqual(await getLatestCleanupRun(fixture.dbPath), null);
    assert.deepEqual(await restoreIgnoredConversations(fixture.dbPath), { restoredConversations: 1 });
    assert.equal(await getIgnoredConversationCount(fixture.dbPath), 0);
    assert.equal(await getLatestCleanupRun(fixture.dbPath), null);

    const ingest = await ingestAllSources(fixture);
    const report = await getMemoryQualityReport(fixture.dbPath, { limit: 20 });

    assert.equal(ingest.conversations, 1);
    assert.equal(report.summary.archiveCandidateMemories, 1);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("lists ignored memories and restores only the selected tombstone", async () => {
  const fixture = await makeFixtureDir();
  try {
    await appendFile(
      fixture.codexIndexPath,
      `\n${JSON.stringify({
        id: "codex-command",
        thread_name: "<command-name>/model</command-name>",
        updated_at: "2026-05-29T07:20:00Z"
      })}`
    );
    await ingestAllSources(fixture);
    const db = await ensureDatabase(fixture.dbPath);
    db.prepare(
      `INSERT INTO conversations
       (id, source, title, summary, project_path, occurred_at, raw_ref, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "claude:claude-greeting:1779872400000",
      "claude",
      "你好",
      "目标：你好\n进展：仅标题索引，待补正文。",
      null,
      "2026-05-27T09:00:00Z",
      "claude-greeting",
      "[]"
    );
    db.close();

    await cleanupArchiveCandidateMemories(fixture.dbPath);
    const ignored = await getIgnoredConversations(fixture.dbPath);
    const restored = await restoreIgnoredConversation(fixture.dbPath, "codex:codex-command");
    const afterRestore = await getIgnoredConversations(fixture.dbPath);
    const latestAfterSingleRestore = await getLatestCleanupRun(fixture.dbPath);
    const ingest = await ingestAllSources(fixture);
    const report = await getMemoryQualityReport(fixture.dbPath, { limit: 20 });

    assert.deepEqual(
      ignored.map((item) => ({ id: item.id, source: item.source, title: item.title, reason: item.reason })),
      [
        {
          id: "claude:claude-greeting:1779872400000",
          source: "claude",
          title: "你好",
          reason: "archive-candidate"
        },
        {
          id: "codex:codex-command",
          source: "codex",
          title: "<command-name>/model</command-name>",
          reason: "archive-candidate"
        }
      ]
    );
    assert.deepEqual(restored, { restoredConversations: 1 });
    assert.deepEqual(afterRestore.map((item) => item.id), ["claude:claude-greeting:1779872400000"]);
    assert.notEqual(latestAfterSingleRestore, null);
    assert.equal(ingest.conversations, 1);
    assert.equal(ingest.skippedIgnoredConversations, 0);
    assert.equal(report.summary.archiveCandidateMemories, 1);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("cleans archive candidate memories for only the selected source", async () => {
  const fixture = await makeFixtureDir();
  try {
    await appendFile(
      fixture.codexIndexPath,
      `\n${JSON.stringify({
        id: "codex-command",
        thread_name: "<command-name>/model</command-name>",
        updated_at: "2026-05-29T07:20:00Z"
      })}`
    );
    await ingestAllSources(fixture);
    const db = await ensureDatabase(fixture.dbPath);
    db.prepare(
      `INSERT INTO conversations
       (id, source, title, summary, project_path, occurred_at, raw_ref, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "claude:claude-greeting:1779872400000",
      "claude",
      "你好",
      "目标：你好\n进展：仅标题索引，待补正文。",
      null,
      "2026-05-27T09:00:00Z",
      "claude-greeting",
      "[]"
    );
    db.close();

    const cleaned = await cleanupArchiveCandidateMemories(fixture.dbPath, { source: "codex" });
    const ignored = await getIgnoredConversations(fixture.dbPath);
    const report = await getMemoryQualityReport(fixture.dbPath, { limit: 20 });

    assertCleanupResult(cleaned, {
      ignoredConversations: 1,
      deletedConversations: 1
    });
    assert.deepEqual(ignored.map((item) => item.id), ["codex:codex-command"]);
    assert.equal(report.summary.archiveCandidateMemories, 1);
    assert.equal(report.items.find((item) => item.status === "archive-candidate")?.memory.source, "claude");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("cleans only title fallback archive candidates when scoped by summary origin", async () => {
  const fixture = await makeFixtureDir();
  try {
    await appendFile(
      fixture.codexIndexPath,
      `\n${JSON.stringify({
        id: "codex-command",
        thread_name: "<command-name>/model</command-name>",
        updated_at: "2026-05-29T07:20:00Z"
      })}`
    );
    await ingestAllSources(fixture);
    const db = await ensureDatabase(fixture.dbPath);
    db.prepare(
      `INSERT INTO conversations
       (id, source, title, summary, summary_origin, project_path, occurred_at, raw_ref, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "claude:thread-body-greeting:1779872400000",
      "claude",
      "你好",
      "目标：确认一次短问候线程。\n进展：已经从线程正文生成摘要。",
      "thread-body",
      null,
      "2026-05-27T09:00:00Z",
      "thread-body-greeting",
      "[]"
    );
    db.close();

    const cleaned = await cleanupArchiveCandidateMemories(fixture.dbPath, { summaryOrigin: "title-fallback" });
    const ignored = await getIgnoredConversations(fixture.dbPath);
    const report = await getMemoryQualityReport(fixture.dbPath, { limit: 20 });

    assertCleanupResult(cleaned, {
      ignoredConversations: 1,
      deletedConversations: 1
    });
    assert.deepEqual(ignored.map((item) => item.id), ["codex:codex-command"]);
    assert.equal(report.summary.titleFallbackSummaries, 2);
    assert.equal(report.summary.archiveCandidateMemories, 1);
    assert.equal(report.items.find((item) => item.status === "archive-candidate")?.memory.id, "claude:thread-body-greeting:1779872400000");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("audits archive candidates by source, summary origin, and project link", async () => {
  const fixture = await makeFixtureDir();
  try {
    await appendFile(
      fixture.codexIndexPath,
      `\n${JSON.stringify({
        id: "codex-command",
        thread_name: "<command-name>/model</command-name>",
        updated_at: "2026-05-29T07:20:00Z"
      })}`
    );
    await ingestAllSources(fixture);
    const db = await ensureDatabase(fixture.dbPath);
    db.prepare(
      `INSERT INTO conversations
       (id, source, title, summary, summary_origin, project_path, occurred_at, raw_ref, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "claude:thread-body-greeting:1779872400000",
      "claude",
      "你好",
      "目标：确认一次短问候线程。\n进展：已经从线程正文生成摘要。",
      "thread-body",
      path.join(fixture.projectsRoot, "hotspot-hub"),
      "2026-05-27T09:00:00Z",
      "thread-body-greeting",
      "[]"
    );
    db.close();

    const audit = await getArchiveCandidateAudit(fixture.dbPath);

    assert.equal(audit.summary.totalCandidates, 2);
    assert.equal(audit.summary.codexCandidates, 1);
    assert.equal(audit.summary.claudeCandidates, 1);
    assert.equal(audit.summary.titleFallbackCandidates, 1);
    assert.equal(audit.summary.threadBodyCandidates, 1);
    assert.equal(audit.summary.manualCandidates, 0);
    assert.equal(audit.summary.linkedProjectCandidates, 1);
    assert.equal(audit.summary.unlinkedProjectCandidates, 1);
    assert.equal(audit.summary.commandCandidates, 1);
    assert.equal(audit.summary.greetingCandidates, 1);
    assert.deepEqual(
      audit.items.map((item) => [item.memory.id, item.candidateKind]),
      [
        ["codex:codex-command", "command"],
        ["claude:thread-body-greeting:1779872400000", "greeting"]
      ]
    );
    assert.deepEqual(
      audit.groups.map((group) => ({
        kind: group.candidateKind,
        source: group.source,
        origin: group.summaryOrigin,
        projectName: group.projectName,
        count: group.count
      })),
      [
        {
          kind: "command",
          source: "codex",
          origin: "title-fallback",
          projectName: "无项目",
          count: 1
        },
        {
          kind: "greeting",
          source: "claude",
          origin: "thread-body",
          projectName: "hotspot-hub",
          count: 1
        }
      ]
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("cleans archive candidates only within the selected audit group", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);
    const db = await ensureDatabase(fixture.dbPath);
    const insert = db.prepare(
      `INSERT INTO conversations
       (id, source, title, summary, summary_origin, project_path, occurred_at, raw_ref, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insert.run(
      "claude:hotspot-greeting:1779872400000",
      "claude",
      "你好",
      "目标：确认 hotspot 问候线程。\n进展：已经从线程正文生成摘要。",
      "thread-body",
      path.join(fixture.projectsRoot, "hotspot-hub"),
      "2026-05-27T09:00:00Z",
      "hotspot-greeting",
      "[]"
    );
    insert.run(
      "claude:farm-greeting:1779872400001",
      "claude",
      "你好",
      "目标：确认 FarmGame 问候线程。\n进展：已经从线程正文生成摘要。",
      "thread-body",
      path.join(fixture.projectsRoot, "FarmGame"),
      "2026-05-27T09:01:00Z",
      "farm-greeting",
      "[]"
    );
    db.close();

    const cleaned = await cleanupArchiveCandidateMemories(fixture.dbPath, {
      candidateKind: "greeting",
      source: "claude",
      summaryOrigin: "thread-body",
      projectName: "hotspot-hub"
    });
    const audit = await getArchiveCandidateAudit(fixture.dbPath);

    assertCleanupResult(cleaned, {
      ignoredConversations: 1,
      deletedConversations: 1
    });
    assert.equal(audit.items.some((item) => item.memory.id === "claude:hotspot-greeting:1779872400000"), false);
    assert.equal(audit.items.some((item) => item.memory.id === "claude:farm-greeting:1779872400001"), true);
    assert.equal(
      audit.groups.some(
        (group) =>
          group.candidateKind === "greeting" &&
          group.source === "claude" &&
          group.summaryOrigin === "thread-body" &&
          group.projectName === "hotspot-hub"
      ),
      false
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("previews archive cleanup with the same filters used for grouped cleanup", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);
    const db = await ensureDatabase(fixture.dbPath);
    const insert = db.prepare(
      `INSERT INTO conversations
       (id, source, title, summary, summary_origin, project_path, occurred_at, raw_ref, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insert.run(
      "claude:hotspot-greeting:1779872400000",
      "claude",
      "你好",
      "目标：确认 hotspot 问候线程。\n进展：已经从线程正文生成摘要。",
      "thread-body",
      path.join(fixture.projectsRoot, "hotspot-hub"),
      "2026-05-27T09:00:00Z",
      "hotspot-greeting",
      "[]"
    );
    insert.run(
      "claude:farm-greeting:1779872400001",
      "claude",
      "你好",
      "目标：确认 FarmGame 问候线程。\n进展：已经从线程正文生成摘要。",
      "thread-body",
      path.join(fixture.projectsRoot, "FarmGame"),
      "2026-05-27T09:01:00Z",
      "farm-greeting",
      "[]"
    );
    db.close();

    const filters = {
      candidateKind: "greeting" as const,
      source: "claude" as const,
      summaryOrigin: "thread-body" as const,
      projectName: "hotspot-hub"
    };
    const preview = await previewArchiveCandidateCleanup(fixture.dbPath, filters);
    const cleaned = await cleanupArchiveCandidateMemories(fixture.dbPath, filters);

    assert.equal(preview.summary.matchedCandidates, 1);
    assert.deepEqual(preview.summary.sampleTitles, ["你好"]);
    assert.deepEqual(
      preview.items.map((item) => item.memory.id),
      ["claude:hotspot-greeting:1779872400000"]
    );
    assert.equal(cleaned.deletedConversations, preview.summary.matchedCandidates);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("keeps selected archive candidates out of quality cleanup until released", async () => {
  const fixture = await makeFixtureDir();
  try {
    await appendFile(
      fixture.codexIndexPath,
      `\n${JSON.stringify({
        id: "codex-command",
        thread_name: "<command-name>/model</command-name>",
        updated_at: "2026-05-29T07:20:00Z"
      })}`
    );
    await ingestAllSources(fixture);

    const kept = await keepArchiveCandidate(fixture.dbPath, "codex:codex-command", "这是一个需要保留的快捷命令线程。");
    const afterKeepAudit = await getArchiveCandidateAudit(fixture.dbPath);
    const afterKeepPreview = await previewArchiveCandidateCleanup(fixture.dbPath);
    const afterKeepCleanup = await cleanupArchiveCandidateMemories(fixture.dbPath);
    const keptItems = await getKeptArchiveCandidates(fixture.dbPath);
    const released = await unkeepArchiveCandidate(fixture.dbPath, "codex:codex-command");
    const afterReleasePreview = await previewArchiveCandidateCleanup(fixture.dbPath);

    assert.deepEqual(kept, { kept: true });
    assert.equal(afterKeepAudit.items.some((item) => item.memory.id === "codex:codex-command"), false);
    assert.equal(afterKeepPreview.summary.matchedCandidates, 0);
    assertCleanupResult(afterKeepCleanup, {
      ignoredConversations: 0,
      deletedConversations: 0
    });
    assert.deepEqual(
      keptItems.map((item) => ({ id: item.id, reason: item.reason })),
      [{ id: "codex:codex-command", reason: "这是一个需要保留的快捷命令线程。" }]
    );
    assert.deepEqual(released, { released: true });
    assert.equal(afterReleasePreview.summary.matchedCandidates, 1);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("builds a memory quality safety plan before real cleanup", async () => {
  const fixture = await makeFixtureDir();
  try {
    await appendFile(
      fixture.codexIndexPath,
      `\n${JSON.stringify({
        id: "codex-command",
        thread_name: "<command-name>/model</command-name>",
        updated_at: "2026-05-29T07:20:00Z"
      })}`
    );
    await ingestAllSources(fixture);
    let plan = await getMemoryQualitySafetyPlan({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      today: "2026-05-30"
    });

    assert.equal(plan.metrics.archiveCandidates, 1);
    assert.equal(plan.metrics.auditExported, false);
    assert.equal(plan.metrics.auditExportedToday, false);
    assert.equal(plan.nextStepId, "export-audit");
    assert.equal(plan.steps.find((step) => step.id === "export-audit")?.status, "ready");
    assert.equal(plan.steps.find((step) => step.id === "preview-cleanup")?.status, "blocked");

    await writeFile(path.join(fixture.obsidianVault, "Memory Quality.md"), "# 记忆质量审计\n\n> 2026-05-29：旧审计。\n");
    plan = await getMemoryQualitySafetyPlan({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      today: "2026-05-30"
    });

    assert.equal(plan.metrics.auditExported, true);
    assert.equal(plan.metrics.auditExportedToday, false);
    assert.equal(plan.nextStepId, "export-audit");
    assert.equal(plan.steps.find((step) => step.id === "review-candidates")?.status, "blocked");

    await exportMemoryQualityAuditToObsidian({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      today: "2026-05-30"
    });
    await keepArchiveCandidate(fixture.dbPath, "codex:codex-command", "保留快捷命令");
    plan = await getMemoryQualitySafetyPlan({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      today: "2026-05-30"
    });

    assert.equal(plan.metrics.archiveCandidates, 0);
    assert.equal(plan.metrics.keptArchiveCandidates, 1);
    assert.equal(plan.metrics.auditExported, true);
    assert.equal(plan.metrics.auditExportedToday, true);
    assert.equal(plan.nextStepId, null);
    assert.equal(plan.steps.every((step) => step.status === "done" || step.status === "blocked"), true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("records cleanup runs and can undo only the latest cleanup batch", async () => {
  const fixture = await makeFixtureDir();
  try {
    await appendFile(
      fixture.codexIndexPath,
      `\n${JSON.stringify({
        id: "codex-command",
        thread_name: "<command-name>/model</command-name>",
        updated_at: "2026-05-29T07:20:00Z"
      })}`
    );
    await ingestAllSources(fixture);
    const db = await ensureDatabase(fixture.dbPath);
    db.prepare(
      `INSERT INTO conversations
       (id, source, title, summary, summary_origin, project_path, occurred_at, raw_ref, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "claude:thread-body-greeting:1779872400000",
      "claude",
      "你好",
      "目标：确认一次短问候线程。\n进展：已经从线程正文生成摘要。",
      "thread-body",
      path.join(fixture.projectsRoot, "hotspot-hub"),
      "2026-05-27T09:00:00Z",
      "thread-body-greeting",
      "[]"
    );
    db.close();

    const first = await cleanupArchiveCandidateMemories(fixture.dbPath, { source: "codex" });
    const second = await cleanupArchiveCandidateMemories(fixture.dbPath, { source: "claude" });
    const latest = await getLatestCleanupRun(fixture.dbPath);
    const undone = await undoLatestCleanupRun(fixture.dbPath);
    const ignored = await getIgnoredConversations(fixture.dbPath);
    const afterUndoLatest = await getLatestCleanupRun(fixture.dbPath);

    assert.equal(first.deletedConversations, 1);
    assert.equal(second.deletedConversations, 1);
    assert.equal(typeof first.cleanupRunId, "string");
    assert.equal(typeof second.cleanupRunId, "string");
    assert.notEqual(first.cleanupRunId, second.cleanupRunId);
    assert.equal(latest?.id, second.cleanupRunId);
    assert.deepEqual(undone, { restoredConversations: 1, cleanupRunId: second.cleanupRunId });
    assert.deepEqual(ignored.map((item) => item.id), ["codex:codex-command"]);
    assert.equal(afterUndoLatest?.id, first.cleanupRunId);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("lists cleanup run history and can undo a selected cleanup batch", async () => {
  const fixture = await makeFixtureDir();
  try {
    await appendFile(
      fixture.codexIndexPath,
      `\n${JSON.stringify({
        id: "codex-command",
        thread_name: "<command-name>/model</command-name>",
        updated_at: "2026-05-29T07:20:00Z"
      })}`
    );
    await ingestAllSources(fixture);
    const db = await ensureDatabase(fixture.dbPath);
    db.prepare(
      `INSERT INTO conversations
       (id, source, title, summary, summary_origin, project_path, occurred_at, raw_ref, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "claude:thread-body-greeting:1779872400000",
      "claude",
      "你好",
      "目标：确认一次短问候线程。\n进展：已经从线程正文生成摘要。",
      "thread-body",
      path.join(fixture.projectsRoot, "hotspot-hub"),
      "2026-05-27T09:00:00Z",
      "thread-body-greeting",
      "[]"
    );
    db.close();

    const first = await cleanupArchiveCandidateMemories(fixture.dbPath, { source: "codex" });
    const second = await cleanupArchiveCandidateMemories(fixture.dbPath, { source: "claude" });
    const beforeUndo = await getCleanupRuns(fixture.dbPath);
    const undone = await undoCleanupRun(fixture.dbPath, first.cleanupRunId!);
    const ignored = await getIgnoredConversations(fixture.dbPath);
    const afterUndo = await getCleanupRuns(fixture.dbPath);

    assert.deepEqual(
      beforeUndo.map((run) => ({ id: run.id, filterLabel: run.filterLabel, undoneAt: run.undoneAt })),
      [
        { id: second.cleanupRunId, filterLabel: "source:claude", undoneAt: null },
        { id: first.cleanupRunId, filterLabel: "source:codex", undoneAt: null }
      ]
    );
    assert.deepEqual(undone, { restoredConversations: 1, cleanupRunId: first.cleanupRunId });
    assert.deepEqual(ignored.map((item) => item.id), ["claude:thread-body-greeting:1779872400000"]);
    assert.equal(afterUndo.find((run) => run.id === first.cleanupRunId)?.undoneAt !== null, true);
    assert.equal(afterUndo.find((run) => run.id === second.cleanupRunId)?.undoneAt, null);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("scans Next.js, Maven, and plain local projects", async () => {
  const fixture = await makeFixtureDir();
  try {
    const projects = await scanProjects(fixture.projectsRoot);
    const byName = new Map(projects.map((project) => [project.name, project]));

    assert.deepEqual(byName.get("hotspot-hub")?.techStack, ["Next.js", "Node.js"]);
    assert.deepEqual(byName.get("FarmGame")?.techStack, ["Maven", "Java"]);
    assert.deepEqual(byName.get("notes")?.techStack, ["未识别"]);
    assert.equal(byName.get("hotspot-hub")?.hasGit, true);
    assert.deepEqual(byName.get("hotspot-hub")?.scripts, ["build", "dev"]);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("builds project-level health checks from detected tech stacks", async () => {
  const fixture = await makeFixtureDir();
  try {
    const projects = await scanProjects(fixture.projectsRoot);
    const options = buildProjectHealthOptions(projects);
    const commandIds = options.commands?.map((check) => check.id).sort() ?? [];
    const envIds = options.envFiles?.map((check) => (typeof check === "string" ? check : check.id)).sort() ?? [];
    const fileIds = options.files?.map((check) => check.id).sort() ?? [];

    assert.ok(commandIds.includes("tool:hotspot-hub:node"));
    assert.ok(commandIds.includes("tool:hotspot-hub:npm"));
    assert.ok(commandIds.includes("tool:FarmGame:java"));
    assert.ok(commandIds.includes("tool:FarmGame:maven"));
    assert.equal(commandIds.some((id) => id.includes("notes")), false);
    assert.equal(commandIds.includes("tool:hotspot-hub:gradle"), false);
    assert.deepEqual(envIds, ["env:hotspot-hub"]);
    assert.deepEqual(fileIds, ["file:FarmGame:maven-wrapper"]);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("builds project detail with linked memories, tags, health, and next actions", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);

    const detail = await getProjectDetail(fixture.dbPath, "FarmGame");
    assert.equal(detail?.project.name, "FarmGame");
    assert.equal(detail?.memories.length, 1);
    assert.equal(detail?.memories[0]?.title, "JAVA_HOME is not set，检查 Gradle 构建环境");
    assert.ok(detail?.relatedTags.includes("构建"));
    assert.ok(detail?.relatedTags.includes("环境"));
    assert.ok(detail?.health.some((check) => check.id === "tool:FarmGame:maven"));
    assert.equal(detail?.health.some((check) => check.id.startsWith("env:hotspot-hub")), false);
    assert.equal(detail?.health.some((check) => check.id.startsWith("tool:hotspot-hub:")), false);
    assert.ok(detail?.nextActions.some((action) => action.includes("构建环境")));

    const missing = await getProjectDetail(fixture.dbPath, "missing-project");
    assert.equal(missing, null);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("cleans memories and project snapshots for deleted local projects", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);
    await rm(path.join(fixture.projectsRoot, "FarmGame"), { recursive: true, force: true });

    const result = await cleanupDeletedProjectMemories(fixture.dbPath);
    const project = await searchMemories(fixture.dbPath, { project: "FarmGame" });
    const detail = await getProjectDetail(fixture.dbPath, "FarmGame");

    assert.equal(result.deletedConversations, 1);
    assert.equal(result.deletedProjectSnapshots, 1);
    assert.deepEqual(result.missingConversationGroups, [{ projectPath: path.join(fixture.projectsRoot, "FarmGame"), count: 1 }]);
    assert.equal(project.items.length, 0);
    assert.equal(detail, null);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("skips conversations that point to deleted project paths during ingest", async () => {
  const fixture = await makeFixtureDir();
  try {
    await rm(path.join(fixture.projectsRoot, "FarmGame"), { recursive: true, force: true });

    const result = await ingestAllSources(fixture);
    const project = await searchMemories(fixture.dbPath, { project: "FarmGame" });

    assert.equal(result.conversations, 3);
    assert.equal(result.skippedDeletedProjectConversations, 1);
    assert.equal(project.items.length, 0);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("removes stale deleted-project memories during a later ingest", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);
    await rm(path.join(fixture.projectsRoot, "FarmGame"), { recursive: true, force: true });

    const result = await ingestAllSources(fixture);
    const project = await searchMemories(fixture.dbPath, { project: "FarmGame" });

    assert.equal(result.cleanedDeletedProjectConversations, 1);
    assert.equal(result.cleanedDeletedProjectSnapshots, 1);
    assert.equal(result.deletedSkippedProjectConversations, 0);
    assert.equal(project.items.length, 0);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("removes stale legacy rows when newly parsed project path is deleted", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);
    const db = await ensureDatabase(fixture.dbPath);
    db.prepare("UPDATE conversations SET project_path = NULL WHERE id = ?").run("claude:claude-2:1779958800000");
    db.close();
    await rm(path.join(fixture.projectsRoot, "FarmGame"), { recursive: true, force: true });

    const result = await ingestAllSources(fixture);
    const project = await searchMemories(fixture.dbPath, { query: "JAVA_HOME", source: "claude" });

    assert.equal(result.deletedSkippedProjectConversations, 1);
    assert.equal(project.items.length, 0);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("exports daily review while preserving manual Obsidian notes", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);
    const actions = await getDailyActions({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      date: "2026-05-30"
    });
    const memoryAction = actions.items.find((item) => item.kind === "memory");
    await setDailyActionStatus({
      dbPath: fixture.dbPath,
      date: "2026-05-30",
      actionId: memoryAction?.id ?? "",
      status: "done"
    });
    const dailyDir = path.join(fixture.obsidianVault, "Daily");
    await mkdir(dailyDir, { recursive: true });
    const target = path.join(dailyDir, "2026-05-30.md");
    await writeFile(target, "旧内容\n<!-- MANUAL_NOTES_START -->\n手动备注\n<!-- MANUAL_NOTES_END -->\n");

    const exportedPath = await exportDailyReviewToObsidian({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      date: "2026-05-30"
    });
    const markdown = await readFile(exportedPath, "utf8");

    assert.equal(exportedPath, target);
    assert.match(markdown, /# 2026-05-30 AI 工作流复盘/);
    assert.match(markdown, /## 今日行动/);
    assert.match(markdown, /## 推进项目/);
    assert.match(markdown, /hotspot-hub：2 条对话/);
    assert.match(markdown, /## 反复阻塞/);
    assert.match(markdown, /FarmGame/);
    assert.match(markdown, /## 下一步/);
    assert.match(markdown, /回顾今日新增记忆/);
    assert.match(markdown, /已完成/);
    assert.match(markdown, /优化首页天气新闻GitHub卡片/);
    assert.match(markdown, /手动备注/);
    assert.match(markdown, /<!-- MANUAL_NOTES_START -->/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("exports project archive while preserving manual Obsidian notes", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);
    await generateProjectKnowledgeSnapshot({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      projectName: "FarmGame",
      capturedAt: "2026-05-30T12:00:00.000Z"
    });
    const projectsDir = path.join(fixture.obsidianVault, "Projects");
    await mkdir(projectsDir, { recursive: true });
    const target = path.join(projectsDir, "FarmGame.md");
    await writeFile(target, "旧项目档案\n<!-- MANUAL_NOTES_START -->\n下一次先修 Gradle。\n<!-- MANUAL_NOTES_END -->\n");

    const exportedPath = await exportProjectArchiveToObsidian({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      projectName: "FarmGame"
    });
    const markdown = await readFile(exportedPath, "utf8");

    assert.equal(exportedPath, target);
    assert.match(markdown, /# FarmGame 项目档案/);
    assert.match(markdown, /Maven, Java/);
    assert.match(markdown, /JAVA_HOME is not set，检查 Gradle 构建环境/);
    assert.match(markdown, /构建环境/);
    assert.match(markdown, /## 阶段快照/);
    assert.match(markdown, /恢复构建环境可见性/);
    assert.match(markdown, /当前架构/);
    assert.match(markdown, /测试信号/);
    assert.match(markdown, /下一次先修 Gradle。/);
    assert.match(markdown, /<!-- AUTO_GENERATED_START -->/);
    assert.match(markdown, /<!-- MANUAL_NOTES_START -->/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("generates project knowledge snapshots from project signals", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);
    const snapshot = await generateProjectKnowledgeSnapshot({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      projectName: "hotspot-hub",
      capturedAt: "2026-05-30T12:00:00.000Z"
    });
    const latest = await getLatestProjectKnowledgeSnapshot(fixture.dbPath, "hotspot-hub");

    assert.equal(snapshot?.projectName, "hotspot-hub");
    assert.equal(snapshot?.capturedAt, "2026-05-30T12:00:00.000Z");
    assert.match(snapshot?.summary ?? "", /Next\.js/);
    assert.ok(snapshot?.shippedFeatures.some((item) => item.includes("优化首页天气新闻GitHub卡片")));
    assert.ok(snapshot?.currentArchitecture.some((item) => item.includes("Next.js")));
    assert.ok(snapshot?.dataSources.some((item) => item.includes("Codex")));
    assert.ok(snapshot?.testSignals.some((item) => item.includes("builds project detail")));
    assert.ok(snapshot?.knownGaps.some((item) => item.includes("知识库")));
    assert.ok(snapshot?.nextMilestones.some((item) => item.includes("阶段快照")));
    assert.equal(latest?.id, snapshot?.id);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("returns null when exporting a missing project archive", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);

    const exportedPath = await exportProjectArchiveToObsidian({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      projectName: "missing-project"
    });

    assert.equal(exportedPath, null);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("builds project archive index with export status and project signals", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);
    await exportProjectArchiveToObsidian({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      projectName: "FarmGame"
    });

    const index = await getProjectArchiveIndex({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault
    });
    const farm = index.items.find((item) => item.project.name === "FarmGame");
    const hotspot = index.items.find((item) => item.project.name === "hotspot-hub");

    assert.equal(index.summary.totalProjects, 3);
    assert.equal(index.summary.exportedProjects, 1);
    assert.equal(index.summary.totalMemories, 3);
    assert.equal(index.summary.warningProjects, 2);
    assert.equal(farm?.archiveExists, true);
    assert.equal(farm?.memoryCount, 1);
    assert.equal(farm?.warningCount, 1);
    assert.equal(farm?.nextActionCount, 2);
    assert.equal(farm?.archivePath.endsWith(path.join("Projects", "FarmGame.md")), true);
    assert.equal(hotspot?.archiveExists, false);
    assert.equal(hotspot?.memoryCount, 2);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("exports all project archives from the archive index", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);

    const result = await exportAllProjectArchives({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault
    });
    const projectsDir = path.join(fixture.obsidianVault, "Projects");
    const farm = await readFile(path.join(projectsDir, "FarmGame.md"), "utf8");
    const hotspot = await readFile(path.join(projectsDir, "hotspot-hub.md"), "utf8");
    const notes = await readFile(path.join(projectsDir, "notes.md"), "utf8");

    assert.equal(result.exported, 3);
    assert.equal(result.paths.length, 3);
    assert.match(farm, /# FarmGame 项目档案/);
    assert.match(hotspot, /# hotspot-hub 项目档案/);
    assert.match(notes, /# notes 项目档案/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("reads manual notes from exported project archives", async () => {
  const fixture = await makeFixtureDir();
  try {
    const archivePath = path.join(fixture.obsidianVault, "Projects", "FarmGame.md");
    await mkdir(path.dirname(archivePath), { recursive: true });
    await writeFile(
      archivePath,
      [
        "<!-- AUTO_GENERATED_START -->",
        "# FarmGame 项目档案",
        "<!-- AUTO_GENERATED_END -->",
        "",
        "<!-- MANUAL_NOTES_START -->",
        "目标：先让 Gradle 构建恢复。",
        "决策：暂时不迁移框架。",
        "<!-- MANUAL_NOTES_END -->"
      ].join("\n")
    );

    const notes = await readProjectManualNotes(fixture.obsidianVault, "FarmGame");
    const missing = await readProjectManualNotes(fixture.obsidianVault, "missing-project");

    assert.equal(notes, "目标：先让 Gradle 构建恢复。\n决策：暂时不迁移框架。");
    assert.equal(missing, "");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("parses manual project notes into goals, decisions, blockers, and notes", () => {
  const parsed = parseProjectManualNotes(
    [
      "目标：先让项目驾驶舱可持续使用。",
      "决策: Obsidian 手动区只读回显，不做双向同步。",
      "阻塞：Gradle 暂时不可用。",
      "普通备注保留原文。",
      "- 目标：列表里的目标也识别。"
    ].join("\n")
  );

  assert.deepEqual(parsed.goals, ["先让项目驾驶舱可持续使用。", "列表里的目标也识别。"]);
  assert.deepEqual(parsed.decisions, ["Obsidian 手动区只读回显，不做双向同步。"]);
  assert.deepEqual(parsed.blockers, ["Gradle 暂时不可用。"]);
  assert.deepEqual(parsed.notes, ["普通备注保留原文。"]);
});

test("includes manual notes in project archive index", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);
    await exportProjectArchiveToObsidian({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      projectName: "FarmGame"
    });
    const archivePath = path.join(fixture.obsidianVault, "Projects", "FarmGame.md");
    const markdown = await readFile(archivePath, "utf8");
    await writeFile(archivePath, markdown.replace("<!-- MANUAL_NOTES_START -->\n\n<!-- MANUAL_NOTES_END -->", "<!-- MANUAL_NOTES_START -->\n下一次先修 Gradle。\n<!-- MANUAL_NOTES_END -->"));

    const index = await getProjectArchiveIndex({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault
    });
    const farm = index.items.find((item) => item.project.name === "FarmGame");

    assert.equal(farm?.manualNotes, "下一次先修 Gradle。");
    assert.deepEqual(farm?.manualSections.notes, ["下一次先修 Gradle。"]);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("builds a cross-project decision timeline from manual notes", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);
    await exportAllProjectArchives({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault
    });
    const projectsDir = path.join(fixture.obsidianVault, "Projects");
    const farmPath = path.join(projectsDir, "FarmGame.md");
    const hotspotPath = path.join(projectsDir, "hotspot-hub.md");
    await writeFile(
      farmPath,
      (await readFile(farmPath, "utf8")).replace(
        "<!-- MANUAL_NOTES_START -->\n\n<!-- MANUAL_NOTES_END -->",
        "<!-- MANUAL_NOTES_START -->\n决策：先修 Gradle 构建，不迁移框架。\n决策：保留 Maven 结构。\n<!-- MANUAL_NOTES_END -->"
      )
    );
    await writeFile(
      hotspotPath,
      (await readFile(hotspotPath, "utf8")).replace(
        "<!-- MANUAL_NOTES_START -->\n\n<!-- MANUAL_NOTES_END -->",
        "<!-- MANUAL_NOTES_START -->\n决策：热点项目继续作为视觉参考。\n<!-- MANUAL_NOTES_END -->"
      )
    );

    const timeline = await getDecisionTimeline({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault
    });

    assert.equal(timeline.summary.totalDecisions, 3);
    assert.equal(timeline.summary.projectsWithDecisions, 2);
    assert.deepEqual(
      timeline.items.map((item) => `${item.projectName}:${item.text}`),
      [
        "FarmGame:先修 Gradle 构建，不迁移框架。",
        "FarmGame:保留 Maven 结构。",
        "hotspot-hub:热点项目继续作为视觉参考。"
      ]
    );
    assert.equal(timeline.items[0]?.archivePath.endsWith(path.join("Projects", "FarmGame.md")), true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("builds a cross-project goal board from manual notes", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);
    await exportAllProjectArchives({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault
    });
    const projectsDir = path.join(fixture.obsidianVault, "Projects");
    const farmPath = path.join(projectsDir, "FarmGame.md");
    const hotspotPath = path.join(projectsDir, "hotspot-hub.md");
    await writeFile(
      farmPath,
      (await readFile(farmPath, "utf8")).replace(
        "<!-- MANUAL_NOTES_START -->\n\n<!-- MANUAL_NOTES_END -->",
        "<!-- MANUAL_NOTES_START -->\n目标：恢复 Java 构建闭环。\n目标：补齐项目档案。\n<!-- MANUAL_NOTES_END -->"
      )
    );
    await writeFile(
      hotspotPath,
      (await readFile(hotspotPath, "utf8")).replace(
        "<!-- MANUAL_NOTES_START -->\n\n<!-- MANUAL_NOTES_END -->",
        "<!-- MANUAL_NOTES_START -->\n目标：继续作为视觉参考。\n<!-- MANUAL_NOTES_END -->"
      )
    );

    const board = await getGoalBoard({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault
    });

    assert.equal(board.summary.totalGoals, 3);
    assert.equal(board.summary.projectsWithGoals, 2);
    assert.deepEqual(
      board.items.map((item) => `${item.projectName}:${item.text}`),
      ["FarmGame:恢复 Java 构建闭环。", "FarmGame:补齐项目档案。", "hotspot-hub:继续作为视觉参考。"]
    );
    assert.equal(board.items[0]?.archivePath.endsWith(path.join("Projects", "FarmGame.md")), true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("builds a project strategy board from goals, decisions, blockers, and actions", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);
    await exportAllProjectArchives({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault
    });
    const projectsDir = path.join(fixture.obsidianVault, "Projects");
    const farmPath = path.join(projectsDir, "FarmGame.md");
    await writeFile(
      farmPath,
      (await readFile(farmPath, "utf8")).replace(
        "<!-- MANUAL_NOTES_START -->\n\n<!-- MANUAL_NOTES_END -->",
        "<!-- MANUAL_NOTES_START -->\n目标：恢复 Java 构建闭环。\n决策：保留 Maven 结构。\n阻塞：Gradle 构建还没恢复。\n<!-- MANUAL_NOTES_END -->"
      )
    );

    const board = await getStrategyBoard({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      today: "2026-05-30"
    });
    const farm = board.items.find((item) => item.project.name === "FarmGame");

    assert.equal(board.summary.totalProjects, 3);
    assert.equal(board.summary.projectsWithGoals, 1);
    assert.equal(board.summary.projectsWithBlockers > 0, true);
    assert.equal(board.summary.projectsWithActions > 0, true);
    assert.deepEqual(farm?.goals, ["恢复 Java 构建闭环。"]);
    assert.deepEqual(farm?.decisions, ["保留 Maven 结构。"]);
    assert.ok(farm?.blockers.some((item) => item.text === "Gradle 构建还没恢复。"));
    assert.ok(farm?.actions.some((item) => item.title.includes("处理阻塞")));
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("builds a blocker board from manual blockers and health reminders", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);
    await exportAllProjectArchives({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault
    });
    const projectsDir = path.join(fixture.obsidianVault, "Projects");
    const farmPath = path.join(projectsDir, "FarmGame.md");
    await writeFile(
      farmPath,
      (await readFile(farmPath, "utf8")).replace(
        "<!-- MANUAL_NOTES_START -->\n\n<!-- MANUAL_NOTES_END -->",
        "<!-- MANUAL_NOTES_START -->\n阻塞：Gradle 构建还没恢复。\n<!-- MANUAL_NOTES_END -->"
      )
    );

    const board = await getBlockerBoard({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault
    });
    const manual = board.items.filter((item) => item.source === "manual");
    const health = board.items.filter((item) => item.source === "health");

    assert.equal(board.summary.manualBlockers, 1);
    assert.equal(board.summary.healthBlockers, health.length);
    assert.equal(board.summary.totalBlockers, manual.length + health.length);
    assert.equal(board.summary.projectsWithBlockers >= 2, true);
    assert.equal(manual[0]?.projectName, "FarmGame");
    assert.equal(manual[0]?.text, "Gradle 构建还没恢复。");
    assert.equal(health.some((item) => item.projectName === "hotspot-hub" && item.text.includes("Gradle")), false);
    assert.equal(health.some((item) => item.projectName === "hotspot-hub" && item.text.includes("环境变量文件")), true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("builds prioritized daily actions from blockers, archives, memories, and health", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);
    await exportProjectArchiveToObsidian({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      projectName: "FarmGame"
    });
    const farmPath = path.join(fixture.obsidianVault, "Projects", "FarmGame.md");
    await writeFile(
      farmPath,
      (await readFile(farmPath, "utf8")).replace(
        "<!-- MANUAL_NOTES_START -->\n\n<!-- MANUAL_NOTES_END -->",
        "<!-- MANUAL_NOTES_START -->\n阻塞：Gradle 构建还没恢复。\n<!-- MANUAL_NOTES_END -->"
      )
    );

    const actions = await getDailyActions({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      date: "2026-05-30",
      limit: 5
    });

    assert.equal(actions.summary.totalActions, 5);
    assert.equal(actions.items[0]?.kind, "blocker");
    assert.equal(actions.items[0]?.projectName, "FarmGame");
    assert.equal(actions.items[0]?.priority, "high");
    assert.match(actions.items[0]?.reason ?? "", /阻塞/);
    assert.match(actions.items[0]?.completionEvidence ?? "", /Obsidian|项目/);
    assert.match(actions.items[0]?.title ?? "", /处理阻塞/);
    assert.equal(actions.items.every((item) => !/[,\s]+$/.test(item.detail)), true);
    assert.ok(actions.items.some((item) => item.kind === "archive" && item.projectName === "hotspot-hub"));
    assert.ok(actions.items.some((item) => item.kind === "memory"));
    assert.ok(actions.items.some((item) => item.kind === "health"));
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("persists daily action status by stable action id", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);
    const first = await getDailyActions({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      date: "2026-05-30",
      limit: 5
    });
    const memoryAction = first.items.find((item) => item.kind === "memory");
    assert.equal(memoryAction?.status, "open");
    assert.match(memoryAction?.id ?? "", /^[a-f0-9]{16}$/);

    await setDailyActionStatus({
      dbPath: fixture.dbPath,
      date: "2026-05-30",
      actionId: memoryAction?.id ?? "",
      status: "done"
    });
    const second = await getDailyActions({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      date: "2026-05-30",
      limit: 5
    });
    const updated = second.items.find((item) => item.id === memoryAction?.id);

    assert.equal(updated?.status, "done");
    assert.equal(second.summary.openActions, second.items.filter((item) => item.status === "open").length);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("builds daily api payload with review fields and action suggestions", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);

    const payload = await getDailyPayload({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      date: "2026-05-30"
    });

    assert.equal(payload.date, "2026-05-30");
    assert.equal(payload.conversations.length, 2);
    assert.equal(payload.projects.length, 3);
    assert.equal(payload.health.length > 0, true);
    assert.equal(payload.actions.summary.date, "2026-05-30");
    assert.ok(payload.actions.items.some((item) => item.kind === "memory"));
    assert.ok(payload.actions.items.every((item) => item.href.startsWith("/")));
    assert.equal(payload.focus.summary.progressedProjects, 1);
    assert.equal(payload.focus.projectProgress[0]?.projectName, "hotspot-hub");
    assert.equal(payload.focus.projectProgress[0]?.conversationCount, 2);
    assert.ok(payload.focus.repeatedBlockers.some((item) => item.projectName === "FarmGame" && item.count > 1));
    assert.ok(payload.focus.nextSteps.some((item) => item.title.includes("处理")));
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("builds review history from database dates and exported daily notes", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);
    await exportDailyReviewToObsidian({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      date: "2026-05-30"
    });
    const dailyDir = path.join(fixture.obsidianVault, "Daily");
    await writeFile(path.join(dailyDir, "2026-05-31.md"), "# 手动创建的复盘\n");

    const history = await getReviewHistory({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault
    });

    assert.deepEqual(
      history.items.map((item) => item.date),
      ["2026-05-31", "2026-05-30", "2026-05-29", "2026-05-28"]
    );
    assert.equal(history.summary.totalDays, 4);
    assert.equal(history.summary.exportedDays, 2);
    assert.equal(history.summary.totalConversations, 4);
    assert.equal(history.summary.daysWithActions, 4);
    assert.equal(history.items[0]?.conversationCount, 0);
    assert.equal(history.items[0]?.exported, true);
    assert.equal(history.items[0]?.exportedPath.endsWith(path.join("Daily", "2026-05-31.md")), true);
    assert.equal(history.items[1]?.conversationCount, 2);
    assert.equal(history.items[1]?.actionCount > 0, true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("builds action inbox with unfinished actions across today and review history", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);
    const actions = await getDailyActions({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      date: "2026-05-30",
      limit: 5
    });
    const blocker = actions.items.find((item) => item.kind === "blocker");
    const archive = actions.items.find((item) => item.kind === "archive");
    const memory = actions.items.find((item) => item.kind === "memory");

    await setDailyActionStatus({
      dbPath: fixture.dbPath,
      date: "2026-05-30",
      actionId: blocker?.id ?? "",
      status: "snoozed"
    });
    await setDailyActionStatus({
      dbPath: fixture.dbPath,
      date: "2026-05-30",
      actionId: archive?.id ?? "",
      status: "skipped"
    });
    await setDailyActionStatus({
      dbPath: fixture.dbPath,
      date: "2026-05-30",
      actionId: memory?.id ?? "",
      status: "done"
    });

    const inbox = await getActionInbox({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      today: "2026-05-31"
    });

    assert.equal(inbox.items[0]?.date, "2026-05-31");
    assert.equal(inbox.items.every((item) => item.status === "open" || item.status === "snoozed"), true);
    assert.equal(inbox.items.some((item) => item.date === "2026-05-30" && item.id === archive?.id), false);
    assert.equal(inbox.items.some((item) => item.date === "2026-05-30" && item.id === memory?.id), false);
    assert.equal(inbox.items.find((item) => item.id === blocker?.id)?.status, "snoozed");
    assert.equal(inbox.summary.totalActions, inbox.items.length);
    assert.equal(inbox.summary.snoozedActions, inbox.items.filter((item) => item.status === "snoozed").length);
    assert.equal(inbox.summary.datesWithActions > 0, true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("groups repeated action inbox items across review dates", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);
    const todayActions = await getDailyActions({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      date: "2026-05-31",
      limit: 5
    });
    const repeatedBlocker = todayActions.items.find((item) => item.kind === "blocker" && item.projectName === "FarmGame");
    if (repeatedBlocker) {
      await setDailyActionStatus({
        dbPath: fixture.dbPath,
        date: "2026-05-31",
        actionId: repeatedBlocker.id,
        status: "snoozed"
      });
    }

    const inbox = await getActionInbox({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      today: "2026-05-31"
    });
    const groupedBlocker = inbox.groups.find((group) => group.kind === "blocker" && group.projectName === "FarmGame");

    assert.ok(groupedBlocker);
    assert.equal(groupedBlocker?.count, 4);
    assert.equal(groupedBlocker?.latestDate, "2026-05-31");
    assert.deepEqual(groupedBlocker?.dates, ["2026-05-31", "2026-05-30", "2026-05-29", "2026-05-28"]);
    assert.equal(groupedBlocker?.status, repeatedBlocker ? "snoozed" : "open");
    assert.equal(inbox.summary.groupedActions < inbox.summary.totalActions, true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("exports action inbox while preserving manual Obsidian notes", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);
    const target = path.join(fixture.obsidianVault, "Actions.md");
    await writeFile(target, "旧行动\n<!-- MANUAL_NOTES_START -->\n长期行动备注\n<!-- MANUAL_NOTES_END -->\n");

    const exportedPath = await exportActionInboxToObsidian({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      today: "2026-05-30"
    });
    const markdown = await readFile(exportedPath, "utf8");

    assert.equal(exportedPath, target);
    assert.match(markdown, /# 行动收件箱/);
    assert.match(markdown, /## 未完成行动/);
    assert.match(markdown, /2026-05-30/);
    assert.match(markdown, /待处理/);
    assert.match(markdown, /出现 3 次/);
    assert.doesNotMatch(markdown, /,，出现/);
    assert.match(markdown, /长期行动备注/);
    assert.match(markdown, /<!-- AUTO_GENERATED_START -->/);
    assert.match(markdown, /<!-- MANUAL_NOTES_START -->/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("exports memory quality audit while preserving manual Obsidian notes", async () => {
  const fixture = await makeFixtureDir();
  try {
    await appendFile(
      fixture.codexIndexPath,
      `\n${JSON.stringify({
        id: "codex-command",
        thread_name: "<command-name>/model</command-name>",
        updated_at: "2026-05-29T07:20:00Z"
      })}`
    );
    await ingestAllSources(fixture);
    await keepArchiveCandidate(fixture.dbPath, "codex:codex-command", "保留快捷命令");
    const target = path.join(fixture.obsidianVault, "Memory Quality.md");
    await writeFile(target, "旧质量报告\n<!-- MANUAL_NOTES_START -->\n质量手动备注\n<!-- MANUAL_NOTES_END -->\n");

    const exportedPath = await exportMemoryQualityAuditToObsidian({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      today: "2026-05-30"
    });
    const markdown = await readFile(exportedPath, "utf8");

    assert.equal(exportedPath, target);
    assert.match(markdown, /# 记忆质量审计/);
    assert.match(markdown, /2026-05-30/);
    assert.match(markdown, /## 摘要质量/);
    assert.match(markdown, /## 归档候选/);
    assert.match(markdown, /## 已保留候选/);
    assert.match(markdown, /保留快捷命令/);
    assert.match(markdown, /质量手动备注/);
    assert.match(markdown, /<!-- AUTO_GENERATED_START -->/);
    assert.match(markdown, /<!-- MANUAL_NOTES_START -->/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("exports strategy board while preserving manual Obsidian notes", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);
    await exportAllProjectArchives({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault
    });
    const farmPath = path.join(fixture.obsidianVault, "Projects", "FarmGame.md");
    await writeFile(
      farmPath,
      (await readFile(farmPath, "utf8")).replace(
        "<!-- MANUAL_NOTES_START -->\n\n<!-- MANUAL_NOTES_END -->",
        "<!-- MANUAL_NOTES_START -->\n目标：恢复 Java 构建闭环。\n决策：保留 Maven 结构。\n阻塞：Gradle 构建还没恢复。\n<!-- MANUAL_NOTES_END -->"
      )
    );
    const target = path.join(fixture.obsidianVault, "Strategy.md");
    await writeFile(target, "旧战略\n<!-- MANUAL_NOTES_START -->\n战略手动备注\n<!-- MANUAL_NOTES_END -->\n");

    const exportedPath = await exportStrategyBoardToObsidian({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      today: "2026-05-30"
    });
    const markdown = await readFile(exportedPath, "utf8");

    assert.equal(exportedPath, target);
    assert.match(markdown, /# 项目战略面板/);
    assert.match(markdown, /## FarmGame/);
    assert.match(markdown, /恢复 Java 构建闭环。/);
    assert.match(markdown, /保留 Maven 结构。/);
    assert.match(markdown, /Gradle 构建还没恢复。/);
    assert.match(markdown, /战略手动备注/);
    assert.match(markdown, /<!-- AUTO_GENERATED_START -->/);
    assert.match(markdown, /<!-- MANUAL_NOTES_START -->/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("syncs daily, actions, strategy, and project archives to Obsidian", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);

    const result = await syncObsidian({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      today: "2026-05-30"
    });

    assert.equal(result.date, "2026-05-30");
    assert.equal(result.dailyPath.endsWith(path.join("Daily", "2026-05-30.md")), true);
    assert.equal(result.actionsPath.endsWith("Actions.md"), true);
    assert.equal(result.strategyPath.endsWith("Strategy.md"), true);
    assert.equal(result.projects.exported, 3);
    assert.equal(result.projects.paths.length, 3);
    await readFile(result.dailyPath, "utf8");
    await readFile(result.actionsPath, "utf8");
    await readFile(result.strategyPath, "utf8");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("records sync run history after Obsidian sync", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);

    await syncObsidian({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      today: "2026-05-30"
    });
    const runs = await getRecentSyncRuns(fixture.dbPath, 5);

    assert.equal(runs.length, 1);
    assert.equal(runs[0]?.date, "2026-05-30");
    assert.equal(runs[0]?.status, "ok");
    assert.equal(runs[0]?.projectCount, 3);
    assert.match(runs[0]?.ranAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(runs[0]?.message.includes("Daily"), true);
    assert.equal(runs[0]?.snapshotSummary?.beforeTargets, 6);
    assert.equal(runs[0]?.snapshotSummary?.afterTargets, 6);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("records before and after target snapshots for successful Obsidian sync", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);

    await syncObsidian({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      today: "2026-05-30"
    });
    const runs = await getRecentSyncRuns(fixture.dbPath, 1);
    const snapshots = await getSyncSnapshots(fixture.dbPath, { syncRunId: runs[0]?.id ?? "" });
    const before = snapshots.items.filter((item) => item.phase === "before");
    const after = snapshots.items.filter((item) => item.phase === "after");

    assert.equal(before.length, 6);
    assert.equal(after.length, 6);
    assert.equal(before.every((item) => !item.exists), true);
    assert.equal(after.every((item) => item.exists), true);
    assert.equal(snapshots.summary.beforeExistingTargets, 0);
    assert.equal(snapshots.summary.afterExistingTargets, 6);
    assert.equal(snapshots.summary.changedTargets >= 6, true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("records failed sync run history when Obsidian sync cannot write", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);
    await rm(fixture.obsidianVault, { recursive: true, force: true });
    await writeFile(fixture.obsidianVault, "vault path is a file");

    await assert.rejects(
      syncObsidian({
        dbPath: fixture.dbPath,
        obsidianVault: fixture.obsidianVault,
        today: "2026-05-30"
      })
    );
    const runs = await getRecentSyncRuns(fixture.dbPath, 5);
    const snapshots = await getSyncSnapshots(fixture.dbPath, { syncRunId: runs[0]?.id ?? "" });

    assert.equal(runs.length, 1);
    assert.equal(runs[0]?.date, "2026-05-30");
    assert.equal(runs[0]?.status, "fail");
    assert.equal(runs[0]?.projectCount, 0);
    assert.equal(runs[0]?.diagnosis?.stage, "daily");
    assert.equal(runs[0]?.diagnosis?.code, "vault-path-conflict");
    assert.match(runs[0]?.diagnosis?.suggestion ?? "", /文件夹/);
    assert.match(runs[0]?.ranAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
    assert.equal((runs[0]?.message.length ?? 0) > 0, true);
    assert.equal(snapshots.items.some((item) => item.phase === "before"), true);
    assert.equal(snapshots.items.some((item) => item.phase === "failure"), true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("diagnoses sync failures by stage and filesystem error", () => {
  const pathConflict = diagnoseSyncFailure("daily", new Error("ENOTDIR: not a directory, mkdir 'D:\\vault\\Daily'"));
  const permission = diagnoseSyncFailure("projects", new Error("EACCES: permission denied, open 'D:\\vault\\Projects\\app.md'"));
  const databaseBusy = diagnoseSyncFailure("actions", new Error("database is locked"));
  const unknown = diagnoseSyncFailure("actions", new Error("unexpected render failure"));

  assert.equal(pathConflict.code, "vault-path-conflict");
  assert.equal(pathConflict.stage, "daily");
  assert.match(pathConflict.title, /Vault 路径/);
  assert.match(pathConflict.suggestion, /文件夹/);
  assert.equal(permission.code, "permission-denied");
  assert.equal(permission.stage, "projects");
  assert.match(permission.suggestion, /写入权限/);
  assert.equal(databaseBusy.code, "database-busy");
  assert.match(databaseBusy.suggestion, /稍等/);
  assert.equal(unknown.code, "unknown");
  assert.equal(unknown.stage, "actions");
  assert.match(unknown.title, /Actions/);
});

test("builds sync audit with status filters, limit, and failure statistics", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);

    await syncObsidian({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      today: "2026-05-29"
    });
    await rm(fixture.obsidianVault, { recursive: true, force: true });
    await writeFile(fixture.obsidianVault, "vault path is a file");
    await assert.rejects(
      syncObsidian({
        dbPath: fixture.dbPath,
        obsidianVault: fixture.obsidianVault,
        today: "2026-05-30"
      })
    );
    await rm(fixture.obsidianVault, { force: true });
    await mkdir(fixture.obsidianVault, { recursive: true });
    await syncObsidian({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      today: "2026-05-31"
    });

    const all = await getSyncAudit({ dbPath: fixture.dbPath, status: "all", limit: 2 });
    const failed = await getSyncAudit({ dbPath: fixture.dbPath, status: "fail", limit: 10 });

    assert.equal(all.items.length, 2);
    assert.equal(all.summary.totalRuns, 3);
    assert.equal(all.summary.okRuns, 2);
    assert.equal(all.summary.failedRuns, 1);
    assert.equal(all.summary.shownRuns, 2);
    assert.equal(all.summary.latestStatus, "ok");
    assert.equal(all.summary.statusFilter, "all");
    assert.equal(failed.items.length, 1);
    assert.equal(failed.items[0]?.status, "fail");
    assert.equal(failed.items[0]?.diagnosis?.code, "vault-path-conflict");
    assert.equal(failed.summary.statusFilter, "fail");
    assert.deepEqual(failed.summary.failureCodes, [{ code: "vault-path-conflict", count: 1 }]);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("starts sync console in retry mode after the latest sync failed", () => {
  const state = getInitialSyncControlState([
    {
      id: "sync:failed",
      date: "2026-05-30",
      status: "fail",
      projectCount: 0,
      message: "EACCES: permission denied",
      diagnosis: null,
      ranAt: "2026-05-30T10:00:00.000Z"
    },
    {
      id: "sync:ok",
      date: "2026-05-29",
      status: "ok",
      projectCount: 3,
      message: "Daily、Actions、Strategy 和 3 个项目档案已同步。",
      diagnosis: null,
      ranAt: "2026-05-29T10:00:00.000Z"
    }
  ]);

  assert.equal(state.label, "重新同步");
  assert.equal(state.tone, "warn");
  assert.match(state.detail, /上次同步失败/);
  assert.match(state.detail, /EACCES/);
});

test("marks only the latest failed sync run as retryable", () => {
  const retryable = getRetryableSyncRunId([
    {
      id: "sync:latest-fail",
      date: "2026-05-31",
      status: "fail",
      projectCount: 0,
      message: "EPERM",
      diagnosis: null,
      ranAt: "2026-05-31T10:00:00.000Z"
    },
    {
      id: "sync:older-fail",
      date: "2026-05-30",
      status: "fail",
      projectCount: 0,
      message: "EACCES",
      diagnosis: null,
      ranAt: "2026-05-30T10:00:00.000Z"
    }
  ]);
  const none = getRetryableSyncRunId([
    {
      id: "sync:latest-ok",
      date: "2026-05-31",
      status: "ok",
      projectCount: 3,
      message: "Daily、Actions、Strategy 和 3 个项目档案已同步。",
      diagnosis: null,
      ranAt: "2026-05-31T10:00:00.000Z"
    }
  ]);

  assert.equal(retryable, "sync:latest-fail");
  assert.equal(none, null);
});

test("reports sync target file status for Obsidian exports", async () => {
  const fixture = await makeFixtureDir();
  try {
    await ingestAllSources(fixture);
    const before = await getSyncStatus({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      today: "2026-05-30"
    });
    assert.equal(before.summary.existingTargets, 0);
    assert.equal(before.targets.some((target) => target.kind === "daily" && !target.exists), true);

    await syncObsidian({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      today: "2026-05-30"
    });
    const after = await getSyncStatus({
      dbPath: fixture.dbPath,
      obsidianVault: fixture.obsidianVault,
      today: "2026-05-30"
    });
    const daily = after.targets.find((target) => target.kind === "daily");
    const projects = after.targets.filter((target) => target.kind === "project");

    assert.equal(after.summary.totalTargets, 6);
    assert.equal(after.summary.existingTargets, 6);
    assert.equal(after.summary.missingTargets, 0);
    assert.equal(daily?.exists, true);
    assert.equal((daily?.sizeBytes ?? 0) > 0, true);
    assert.match(daily?.updatedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(projects.length, 3);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("health checks report runtime and config status without reading secrets", async () => {
  const fixture = await makeFixtureDir();
  try {
    const envPath = path.join(fixture.root, ".env.local");
    await writeFile(envPath, "SECRET_TOKEN=do-not-show\nPUBLIC_FLAG=true\n");

    const checks = await runHealthChecks({
      envFiles: [envPath],
      commands: [
        { id: "node", label: "Node.js", command: "node", args: ["--version"], required: true },
        { id: "npm", label: "npm", command: "npm", args: ["--version"], required: true },
        { id: "missing", label: "Missing Tool", command: "definitely-missing-tool", args: ["--version"], required: false }
      ]
    });

    const nodeCheck = checks.find((check) => check.id === "node");
    const npmCheck = checks.find((check) => check.id === "npm");
    const missingCheck = checks.find((check) => check.id === "missing");
    const envCheck = checks.find((check) => check.id === "env:CUSTOM_0");

    assert.equal(nodeCheck?.status, "ok");
    assert.equal(npmCheck?.status, "ok");
    assert.equal(missingCheck?.status, "warn");
    assert.equal(envCheck?.status, "ok");
    assert.equal(envCheck?.detail.includes("do-not-show"), false);
    assert.match(envCheck?.detail ?? "", /SECRET_TOKEN/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

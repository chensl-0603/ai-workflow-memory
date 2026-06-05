import { searchMemories } from "./search.ts";
import { ensureDatabase } from "./db.ts";
import path from "node:path";
import { readFile } from "node:fs/promises";
import type {
  ArchiveCandidateAudit,
  ArchiveCandidateCleanupPreview,
  ArchiveCandidateGroup,
  ArchiveCandidateItem,
  ArchiveCandidateKind,
  ConversationItem,
  CleanupRun,
  MemoryQualitySignal,
  MemoryQualityIssue,
  MemoryQualityReport,
  MemoryQualitySafetyPlan,
  MemoryQualitySafetyStep,
  SourceKind,
  TitleFallbackDiagnostic,
  TitleFallbackReview
} from "./types.ts";

type ArchiveCandidateCleanupFilters = {
  source?: SourceKind;
  summaryOrigin?: ConversationItem["summaryOrigin"];
  candidateKind?: ArchiveCandidateKind;
  projectName?: string;
};

type KeptArchiveCandidateRow = {
  id: string;
  source: string;
  title: string;
  reason: string;
  keptAt: string;
};

type SourceHealthState = {
  exists: boolean;
  itemCount: number;
};

const noisePatterns = [
  /# AGENTS\.md instructions/i,
  /<goal_context>/i,
  /continue working toward the active thread goal/i,
  /external_agent_tool_call/i,
  /external_agent_tool_result/i,
  /knowledge cutoff:/i,
  /sandbox_mode/i,
  /approval policy/i
];

const shanghaiDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function isArchiveCandidate(memory: ConversationItem) {
  const title = memory.title.replace(/^[●\s]+/, "").trim();
  const command = title.match(/^<command-name>(\/[^<]+)<\/command-name>$/i)?.[1] ?? title;
  return /^\/[\w-]+$/i.test(command) || /^(你好|你好[，、。!！]?|hello|hi)$/i.test(title);
}

function getArchiveCandidateKind(memory: ConversationItem): ArchiveCandidateKind {
  const title = memory.title.replace(/^[●\s]+/, "").trim();
  const command = title.match(/^<command-name>(\/[^<]+)<\/command-name>$/i)?.[1] ?? title;
  return /^\/[\w-]+$/i.test(command) ? "command" : "greeting";
}

function getArchiveCandidateKindLabel(kind: ArchiveCandidateKind) {
  return kind === "command" ? "命令类" : "问候类";
}

function getProjectName(projectPath: string | null) {
  if (!projectPath) return "无项目";
  return projectPath.split(/[\\/]/).filter(Boolean).at(-1) ?? projectPath;
}

function clipSummaryText(value: string, limit = 220) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized;
}

function buildTitleFallbackSummary(title: string, tags: string[]) {
  const clues = tags.length > 0 ? `\n线索：${tags.join("、")}` : "";
  return `目标：${clipSummaryText(title)}\n进展：仅标题索引，待补正文。${clues}`;
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

async function getKeptArchiveCandidateIds(dbPath: string) {
  const db = await ensureDatabase(dbPath);
  try {
    const rows = db.prepare("SELECT id FROM kept_archive_candidates").all() as { id: string }[];
    return new Set(rows.map((row) => row.id));
  } finally {
    db.close();
  }
}

async function getSourceHealthStates(dbPath: string) {
  const db = await ensureDatabase(dbPath);
  try {
    const rows = db.prepare("SELECT source, file_exists, item_count FROM source_health_checks").all() as Array<{
      source: string;
      file_exists: number;
      item_count: number;
    }>;
    return new Map<SourceKind, SourceHealthState>(
      rows
        .filter((row) => row.source === "codex" || row.source === "claude")
        .map((row) => [
          row.source as SourceKind,
          {
            exists: Boolean(row.file_exists),
            itemCount: Number(row.item_count)
          }
        ])
    );
  } finally {
    db.close();
  }
}

function buildBodyBackupSignal(summaryOrigin: ConversationItem["summaryOrigin"]): MemoryQualitySignal {
  if (summaryOrigin === "thread-body") {
    return {
      status: "backed-up",
      label: "正文已备份",
      detail: "这条记忆来自线程正文，已经有可复盘的正文摘要。",
      suggestion: null
    };
  }
  if (summaryOrigin === "manual") {
    return {
      status: "manual-only",
      label: "人工摘要",
      detail: "这条记忆由人工摘要接管，后续采集不会覆盖它。",
      suggestion: "保留人工摘要；确认不再需要人工锁定时再交回采集器。"
    };
  }
  return {
    status: "missing",
    label: "缺少正文",
    detail: "这条记忆只有标题级兜底摘要，尚未读到可用线程正文。",
    suggestion: "优先人工补摘要，或检查对应源文件是否还存在。"
  };
}

function buildRecoverabilitySignal(
  memory: ConversationItem,
  summaryOrigin: ConversationItem["summaryOrigin"],
  sourceHealthStates: Map<SourceKind, SourceHealthState>
): MemoryQualitySignal {
  if (summaryOrigin === "thread-body") {
    return {
      status: "complete",
      label: "可复盘",
      detail: "正文摘要已写入记忆库，即使源索引变化也保留基本上下文。",
      suggestion: null
    };
  }
  if (summaryOrigin === "manual") {
    return {
      status: "manual-repaired",
      label: "人工修复",
      detail: "缺失正文已由人工摘要补齐。",
      suggestion: null
    };
  }

  const source = sourceHealthStates.get(memory.source);
  if (!source) {
    return {
      status: "unknown-source",
      label: "源状态未知",
      detail: "还没有这类来源的健康检查记录，无法判断后续能否恢复正文。",
      suggestion: "先重新采集或运行源索引健康检查，再决定补摘要顺序。"
    };
  }
  if (!source.exists || source.itemCount === 0) {
    return {
      status: "source-missing",
      label: "源文件缺失",
      detail: "本地源索引不存在或为空，自动恢复正文的可能性很低。",
      suggestion: "尽快人工补摘要；如果还有原始会话文件，先备份后再重新采集。"
    };
  }
  return {
    status: "recoverable",
    label: "可补救",
    detail: "源索引仍可访问，但当前没有读到正文摘要。",
    suggestion: "优先检查会话正文路径或直接在质量页补摘要。"
  };
}

function scoreMemory(
  memory: ConversationItem,
  options: { keptArchiveCandidateIds?: Set<string>; sourceHealthStates?: Map<SourceKind, SourceHealthState> } = {}
) {
  const issues: MemoryQualityIssue[] = [];
  const summary = memory.summary.trim();
  const needsBody = /进展：仅标题索引，待补正文。/m.test(summary);
  const keptArchiveCandidate = options.keptArchiveCandidateIds?.has(memory.id) ?? false;
  const summaryOrigin =
    memory.summaryOrigin === "manual"
      ? ("manual" as const)
      : memory.summaryOrigin === "title-fallback" || needsBody
        ? ("title-fallback" as const)
        : ("thread-body" as const);
  const sourceHealthStates = options.sourceHealthStates ?? new Map<SourceKind, SourceHealthState>();

  if (!summary) {
    issues.push({
      kind: "empty",
      label: "缺少摘要",
      detail: "这条记忆还没有可复盘的线程摘要。"
    });
  } else {
    const hasStructure = /^目标：/m.test(summary) && /^进展：/m.test(summary);
    if (!hasStructure) {
      issues.push({
        kind: "unstructured",
        label: "摘要未结构化",
        detail: "摘要缺少目标或进展段落。"
      });
    }
    if (noisePatterns.some((pattern) => pattern.test(summary))) {
      issues.push({
        kind: "noise",
        label: "疑似上下文噪声",
        detail: "摘要中包含系统提示、工具包装或线程目标上下文。"
      });
    }
    if (summary.length > 900) {
      issues.push({
        kind: "long",
        label: "摘要过长",
        detail: "摘要超过 900 字符，后续应继续压缩。"
      });
    }
  }

  return {
    memory,
    summaryOrigin,
    bodyBackup: buildBodyBackupSignal(summaryOrigin),
    recoverability: buildRecoverabilitySignal(memory, summaryOrigin, sourceHealthStates),
    status:
      issues.length > 0
        ? ("warn" as const)
        : isArchiveCandidate(memory) && !keptArchiveCandidate
          ? ("archive-candidate" as const)
          : needsBody
            ? ("needs-body" as const)
            : ("ok" as const),
    issues
  };
}

export async function getMemoryQualityReport(dbPath: string, options: { limit?: number } = {}): Promise<MemoryQualityReport> {
  const [keptArchiveCandidateIds, sourceHealthStates, result] = await Promise.all([
    getKeptArchiveCandidateIds(dbPath),
    getSourceHealthStates(dbPath),
    searchMemories(dbPath, { limit: options.limit ?? 200 })
  ]);
  const items = result.items.map((memory) => scoreMemory(memory, { keptArchiveCandidateIds, sourceHealthStates }));

  return {
    items,
    summary: {
      totalMemories: items.length,
      healthyMemories: items.filter((item) => item.status === "ok").length,
      needsBodyMemories: items.filter((item) => item.status === "needs-body").length,
      archiveCandidateMemories: items.filter((item) => item.status === "archive-candidate").length,
      anomalyMemories: items.filter((item) => item.status === "warn").length,
      threadBodySummaries: items.filter((item) => item.summaryOrigin === "thread-body").length,
      titleFallbackSummaries: items.filter((item) => item.summaryOrigin === "title-fallback").length,
      manualSummaries: items.filter((item) => item.summaryOrigin === "manual").length,
      bodyBackedUpMemories: items.filter((item) => item.bodyBackup.status === "backed-up").length,
      recoverableMemories: items.filter((item) => item.recoverability.status === "recoverable").length,
      manualRepairMemories: items.filter((item) => item.recoverability.status === "manual-repaired").length,
      sourceMissingMemories: items.filter((item) => item.recoverability.status === "source-missing").length,
      emptySummary: items.filter((item) => item.issues.some((issue) => issue.kind === "empty")).length,
      unstructuredSummary: items.filter((item) => item.issues.some((issue) => issue.kind === "unstructured")).length,
      noisySummary: items.filter((item) => item.issues.some((issue) => issue.kind === "noise")).length,
      longSummary: items.filter((item) => item.issues.some((issue) => issue.kind === "long")).length
    }
  };
}

function diagnoseTitleFallback(item: ReturnType<typeof scoreMemory>): TitleFallbackDiagnostic {
  if (item.status === "archive-candidate") {
    return {
      memory: item.memory,
      reason: "archive-candidate",
      reasonLabel: "低价值候选",
      detail: "这条标题像纯命令或短问候，优先考虑归档而不是补摘要。",
      suggestedAction: "archive",
      actionLabel: "归档候选"
    };
  }

  if (!item.memory.projectPath) {
    return {
      memory: item.memory,
      reason: "missing-project-link",
      reasonLabel: "缺少项目关联",
      detail: "采集器没有找到线程正文或项目路径，适合先人工补一版结构化摘要。",
      suggestedAction: "manual-summary",
      actionLabel: "人工补摘要"
    };
  }

  return {
    memory: item.memory,
    reason: "missing-thread-body",
    reasonLabel: "缺少线程正文",
    detail: "这条记忆已有项目关联，但没有读到可用正文，适合人工补摘要或后续扩展采集规则。",
    suggestedAction: "manual-summary",
    actionLabel: "人工补摘要"
  };
}

export async function getTitleFallbackReview(dbPath: string): Promise<TitleFallbackReview> {
  const report = await getMemoryQualityReport(dbPath, { limit: Number.MAX_SAFE_INTEGER });
  const items = report.items.filter((item) => item.summaryOrigin === "title-fallback").map(diagnoseTitleFallback);

  return {
    items,
    summary: {
      totalFallbacks: items.length,
      archiveCandidates: items.filter((item) => item.suggestedAction === "archive").length,
      manualSummaryCandidates: items.filter((item) => item.suggestedAction === "manual-summary").length,
      missingProjectLinks: items.filter((item) => !item.memory.projectPath).length,
      projectLinkedFallbacks: items.filter((item) => Boolean(item.memory.projectPath)).length
    }
  };
}

export async function getArchiveCandidateAudit(dbPath: string): Promise<ArchiveCandidateAudit> {
  const report = await getMemoryQualityReport(dbPath, { limit: Number.MAX_SAFE_INTEGER });
  const items: ArchiveCandidateItem[] = report.items
    .filter((item) => item.status === "archive-candidate")
    .map((item) => {
      const candidateKind = getArchiveCandidateKind(item.memory);
      return {
        ...item,
        candidateKind,
        candidateKindLabel: getArchiveCandidateKindLabel(candidateKind),
        projectName: getProjectName(item.memory.projectPath)
      };
    });
  const groups = Array.from(
    items
      .reduce((grouped, item) => {
        const key = [item.candidateKind, item.memory.source, item.summaryOrigin, item.projectName].join("|");
        const existing = grouped.get(key);
        if (existing) {
          existing.count += 1;
          if (existing.sampleTitles.length < 3) existing.sampleTitles.push(item.memory.title);
        } else {
          grouped.set(key, {
            key,
            candidateKind: item.candidateKind,
            candidateKindLabel: item.candidateKindLabel,
            source: item.memory.source,
            summaryOrigin: item.summaryOrigin,
            projectName: item.projectName,
            count: 1,
            sampleTitles: [item.memory.title]
          });
        }
        return grouped;
      }, new Map<string, ArchiveCandidateGroup>())
      .values()
  ).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, "zh-CN"));

  return {
    items,
    groups,
    summary: {
      totalCandidates: items.length,
      codexCandidates: items.filter((item) => item.memory.source === "codex").length,
      claudeCandidates: items.filter((item) => item.memory.source === "claude").length,
      commandCandidates: items.filter((item) => item.candidateKind === "command").length,
      greetingCandidates: items.filter((item) => item.candidateKind === "greeting").length,
      threadBodyCandidates: items.filter((item) => item.summaryOrigin === "thread-body").length,
      titleFallbackCandidates: items.filter((item) => item.summaryOrigin === "title-fallback").length,
      manualCandidates: items.filter((item) => item.summaryOrigin === "manual").length,
      linkedProjectCandidates: items.filter((item) => Boolean(item.memory.projectPath)).length,
      unlinkedProjectCandidates: items.filter((item) => !item.memory.projectPath).length
    }
  };
}

function makeSafetyStep(step: MemoryQualitySafetyStep): MemoryQualitySafetyStep {
  return step;
}

function toLocalDateKey(value: Date) {
  return shanghaiDateFormatter.format(value);
}

async function getMemoryQualityAuditExportStatus(obsidianVault: string, today: string) {
  const auditPath = path.join(obsidianVault, "Memory Quality.md");
  try {
    const markdown = await readFile(auditPath, "utf8");
    return {
      exported: true,
      exportedToday: markdown.includes("# 记忆质量审计") && markdown.includes(`> ${today}：`)
    };
  } catch {
    return {
      exported: false,
      exportedToday: false
    };
  }
}

export async function getMemoryQualitySafetyPlan(options: {
  dbPath: string;
  obsidianVault: string;
  today?: string;
}): Promise<MemoryQualitySafetyPlan> {
  const today = options.today ?? toLocalDateKey(new Date());
  const [archiveAudit, keptArchiveCandidates, ignoredConversations, cleanupRuns] = await Promise.all([
    getArchiveCandidateAudit(options.dbPath),
    getKeptArchiveCandidates(options.dbPath),
    getIgnoredConversations(options.dbPath),
    getCleanupRuns(options.dbPath, { limit: 20 })
  ]);
  const auditExport = await getMemoryQualityAuditExportStatus(options.obsidianVault, today);
  const auditExported = auditExport.exported;
  const auditExportedToday = auditExport.exportedToday;
  const activeCleanupRuns = cleanupRuns.filter((run) => !run.undoneAt).length;
  const hasCandidates = archiveAudit.summary.totalCandidates > 0;

  const steps = [
    makeSafetyStep({
      id: "export-audit",
      title: "导出质量审计",
      detail: auditExportedToday
        ? "今天的 Memory Quality.md 已刷新，可以继续检查误伤候选。"
        : auditExported
          ? "已有旧审计文件，但今天尚未刷新；先导出当前快照。"
          : "先导出 Memory Quality.md，留下清理前快照和手动备注区。",
      status: auditExportedToday ? "done" : "ready",
      actionLabel: "导出审计"
    }),
    makeSafetyStep({
      id: "review-candidates",
      title: "检查误伤候选",
      detail: hasCandidates
        ? `当前还有 ${archiveAudit.summary.totalCandidates} 条归档候选，先把有价值的短线程标记为保留。`
        : "当前没有需要人工排除的归档候选。",
      status: hasCandidates ? (auditExportedToday ? "ready" : "blocked") : "done",
      actionLabel: "标记保留"
    }),
    makeSafetyStep({
      id: "preview-cleanup",
      title: "预览清理范围",
      detail: hasCandidates ? "在执行清理前先预览命中数量和样例标题。" : "没有可预览的归档候选。",
      status: hasCandidates ? (auditExportedToday ? "ready" : "blocked") : "done",
      actionLabel: "预览清理"
    }),
    makeSafetyStep({
      id: "cleanup-candidates",
      title: "执行候选清理",
      detail: hasCandidates ? "只在审计和保留完成后执行清理；清理会生成可撤销批次。" : "没有待清理候选。",
      status: hasCandidates ? "blocked" : "done",
      actionLabel: "执行清理"
    }),
    makeSafetyStep({
      id: "undo-cleanup",
      title: "保留撤销入口",
      detail: activeCleanupRuns > 0 ? `当前有 ${activeCleanupRuns} 个可撤销清理批次。` : "当前没有可撤销清理批次。",
      status: activeCleanupRuns > 0 ? "ready" : "blocked",
      actionLabel: "撤销清理"
    })
  ];
  const nextStep = steps.find((step) => step.status === "ready") ?? null;

  return {
    summary: hasCandidates
      ? `还有 ${archiveAudit.summary.totalCandidates} 条归档候选；建议先导出审计，再排除误伤，最后预览清理。`
      : "当前没有待清理归档候选；保持审计导出和保留列表即可。",
    nextStepId: nextStep?.id ?? null,
    metrics: {
      archiveCandidates: archiveAudit.summary.totalCandidates,
      keptArchiveCandidates: keptArchiveCandidates.length,
      ignoredConversations: ignoredConversations.length,
      cleanupRuns: cleanupRuns.length,
      activeCleanupRuns,
      auditExported,
      auditExportedToday
    },
    steps
  };
}

function filterArchiveCandidateItems(items: ArchiveCandidateItem[], options: ArchiveCandidateCleanupFilters) {
  return items
    .filter((item) => !options.summaryOrigin || item.summaryOrigin === options.summaryOrigin)
    .filter((item) => !options.candidateKind || item.candidateKind === options.candidateKind)
    .filter((item) => !options.projectName || item.projectName === options.projectName)
    .filter((item) => !options.source || item.memory.source === options.source);
}

function buildCleanupFilterLabel(options: ArchiveCandidateCleanupFilters) {
  return [
    options.candidateKind ? `type:${options.candidateKind}` : null,
    options.source ? `source:${options.source}` : null,
    options.summaryOrigin ? `origin:${options.summaryOrigin}` : null,
    options.projectName ? `project:${options.projectName}` : null
  ]
    .filter((item): item is string => Boolean(item))
    .join(" | ") || "all archive candidates";
}

export async function previewArchiveCandidateCleanup(
  dbPath: string,
  options: ArchiveCandidateCleanupFilters = {}
): Promise<ArchiveCandidateCleanupPreview> {
  const audit = await getArchiveCandidateAudit(dbPath);
  const items = filterArchiveCandidateItems(audit.items, options);

  return {
    items,
    summary: {
      matchedCandidates: items.length,
      sampleTitles: items.slice(0, 5).map((item) => item.memory.title)
    }
  };
}

export async function saveManualMemorySummary(dbPath: string, options: { id: string; summary: string }) {
  const summary = options.summary.trim();
  if (!summary) {
    return { updated: false };
  }
  const db = await ensureDatabase(dbPath);
  try {
    const result = db
      .prepare("UPDATE conversations SET summary = ?, summary_origin = 'manual' WHERE id = ?")
      .run(summary, options.id);
    return {
      updated: Number(result.changes) > 0
    };
  } finally {
    db.close();
  }
}

export async function resetManualMemorySummary(dbPath: string, options: { id: string }) {
  const db = await ensureDatabase(dbPath);
  try {
    const row = db
      .prepare("SELECT title, tags FROM conversations WHERE id = ? AND summary_origin = 'manual'")
      .get(options.id) as { title: string; tags: string } | undefined;
    if (!row) {
      return { updated: false };
    }
    const result = db
      .prepare("UPDATE conversations SET summary = ?, summary_origin = 'title-fallback' WHERE id = ? AND summary_origin = 'manual'")
      .run(buildTitleFallbackSummary(row.title, parseJsonArray(row.tags)), options.id);
    return {
      updated: Number(result.changes) > 0
    };
  } finally {
    db.close();
  }
}

export async function keepArchiveCandidate(dbPath: string, id: string, reason = "") {
  const db = await ensureDatabase(dbPath);
  try {
    const row = db.prepare("SELECT id, source, title FROM conversations WHERE id = ?").get(id) as
      | { id: string; source: SourceKind; title: string }
      | undefined;
    if (!row) {
      return { kept: false };
    }
    const result = db
      .prepare(
        `INSERT INTO kept_archive_candidates (id, source, title, reason, kept_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           source = excluded.source,
           title = excluded.title,
           reason = excluded.reason,
           kept_at = excluded.kept_at`
      )
      .run(row.id, row.source, row.title, reason.trim(), new Date().toISOString());
    return {
      kept: Number(result.changes) > 0
    };
  } finally {
    db.close();
  }
}

export async function unkeepArchiveCandidate(dbPath: string, id: string) {
  const db = await ensureDatabase(dbPath);
  try {
    const result = db.prepare("DELETE FROM kept_archive_candidates WHERE id = ?").run(id);
    return {
      released: Number(result.changes) > 0
    };
  } finally {
    db.close();
  }
}

export async function getKeptArchiveCandidates(dbPath: string) {
  const db = await ensureDatabase(dbPath);
  try {
    return db
      .prepare(
        `SELECT id, source, title, reason, kept_at AS keptAt
         FROM kept_archive_candidates
         ORDER BY kept_at DESC, id ASC`
      )
      .all() as KeptArchiveCandidateRow[];
  } finally {
    db.close();
  }
}

export async function cleanupArchiveCandidateMemories(
  dbPath: string,
  options: ArchiveCandidateCleanupFilters = {}
) {
  const audit = await getArchiveCandidateAudit(dbPath);
  const memories = filterArchiveCandidateItems(audit.items, options).map((item) => item.memory);
  if (memories.length === 0) {
    return {
      cleanupRunId: null,
      ignoredConversations: 0,
      deletedConversations: 0
    };
  }

  const db = await ensureDatabase(dbPath);
  try {
    let ignoredConversations = 0;
    let deletedConversations = 0;
    const ignoredAt = new Date().toISOString();
    const cleanupRunId = `cleanup:${Date.now().toString(36)}:${Math.random().toString(16).slice(2, 10)}`;
    db.exec("BEGIN");
    try {
      const insertCleanupRun = db.prepare(
        `INSERT INTO cleanup_runs (id, filter_label, ignored_count, deleted_count, created_at, undone_at)
         VALUES (?, ?, ?, ?, ?, NULL)`
      );
      const ignoreConversation = db.prepare(
        `INSERT INTO ignored_conversations (id, source, title, reason, ignored_at, cleanup_run_id)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`
      );
      const deleteConversation = db.prepare("DELETE FROM conversations WHERE id = ?");
      for (const memory of memories) {
        ignoredConversations += Number(
          ignoreConversation.run(memory.id, memory.source, memory.title, "archive-candidate", ignoredAt, cleanupRunId).changes
        );
        deletedConversations += Number(deleteConversation.run(memory.id).changes);
      }
      insertCleanupRun.run(cleanupRunId, buildCleanupFilterLabel(options), ignoredConversations, deletedConversations, ignoredAt);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return {
      cleanupRunId,
      ignoredConversations,
      deletedConversations
    };
  } finally {
    db.close();
  }
}

function toCleanupRun(row: {
  id: string;
  filter_label: string;
  ignored_count: number;
  deleted_count: number;
  created_at: string;
  undone_at: string | null;
}): CleanupRun {
  return {
    id: row.id,
    filterLabel: row.filter_label,
    ignoredCount: Number(row.ignored_count),
    deletedCount: Number(row.deleted_count),
    createdAt: row.created_at,
    undoneAt: row.undone_at
  };
}

export async function getLatestCleanupRun(dbPath: string) {
  const db = await ensureDatabase(dbPath);
  try {
    const row = db
      .prepare(
        `SELECT id, filter_label, ignored_count, deleted_count, created_at, undone_at
         FROM cleanup_runs
         WHERE undone_at IS NULL
         ORDER BY created_at DESC, id DESC
         LIMIT 1`
      )
      .get() as
      | {
          id: string;
          filter_label: string;
          ignored_count: number;
          deleted_count: number;
          created_at: string;
          undone_at: string | null;
        }
      | undefined;
    return row ? toCleanupRun(row) : null;
  } finally {
    db.close();
  }
}

export async function getCleanupRuns(dbPath: string, options: { limit?: number } = {}) {
  const db = await ensureDatabase(dbPath);
  try {
    return db
      .prepare(
        `SELECT id, filter_label, ignored_count, deleted_count, created_at, undone_at
         FROM cleanup_runs
         ORDER BY created_at DESC, id DESC
         LIMIT ?`
      )
      .all(options.limit ?? 20)
      .map((row) =>
        toCleanupRun(
          row as {
            id: string;
            filter_label: string;
            ignored_count: number;
            deleted_count: number;
            created_at: string;
            undone_at: string | null;
          }
        )
      );
  } finally {
    db.close();
  }
}

export async function undoCleanupRun(dbPath: string, cleanupRunId: string) {
  const db = await ensureDatabase(dbPath);
  try {
    const row = db
      .prepare(
        `SELECT id
         FROM cleanup_runs
         WHERE id = ? AND undone_at IS NULL
         LIMIT 1`
      )
      .get(cleanupRunId) as { id: string } | undefined;
    if (!row) {
      return { restoredConversations: 0, cleanupRunId: null };
    }

    const undoneAt = new Date().toISOString();
    db.exec("BEGIN");
    try {
      const result = db.prepare("DELETE FROM ignored_conversations WHERE cleanup_run_id = ?").run(row.id);
      db.prepare("UPDATE cleanup_runs SET undone_at = ? WHERE id = ?").run(undoneAt, row.id);
      db.exec("COMMIT");
      return {
        restoredConversations: Number(result.changes),
        cleanupRunId: row.id
      };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } finally {
    db.close();
  }
}

export async function undoLatestCleanupRun(dbPath: string) {
  const latest = await getLatestCleanupRun(dbPath);
  return latest ? undoCleanupRun(dbPath, latest.id) : { restoredConversations: 0, cleanupRunId: null };
}

export async function getIgnoredConversationCount(dbPath: string) {
  const db = await ensureDatabase(dbPath);
  try {
    const row = db.prepare("SELECT count(*) AS count FROM ignored_conversations").get() as { count: number };
    return Number(row.count);
  } finally {
    db.close();
  }
}

export async function getIgnoredConversations(dbPath: string) {
  const db = await ensureDatabase(dbPath);
  try {
    return db
      .prepare(
        `SELECT id, source, title, reason, ignored_at AS ignoredAt
         FROM ignored_conversations
         ORDER BY ignored_at DESC, id ASC`
      )
      .all() as Array<{
      id: string;
      source: string;
      title: string;
      reason: string;
      ignoredAt: string;
    }>;
  } finally {
    db.close();
  }
}

export async function restoreIgnoredConversation(dbPath: string, id: string) {
  const db = await ensureDatabase(dbPath);
  try {
    const row = db.prepare("SELECT cleanup_run_id FROM ignored_conversations WHERE id = ?").get(id) as
      | { cleanup_run_id: string | null }
      | undefined;
    const result = db.prepare("DELETE FROM ignored_conversations WHERE id = ?").run(id);
    if (row?.cleanup_run_id) {
      const remaining = db
        .prepare("SELECT count(*) AS count FROM ignored_conversations WHERE cleanup_run_id = ?")
        .get(row.cleanup_run_id) as { count: number };
      if (Number(remaining.count) === 0) {
        db.prepare("UPDATE cleanup_runs SET undone_at = ? WHERE id = ? AND undone_at IS NULL").run(new Date().toISOString(), row.cleanup_run_id);
      }
    }
    return {
      restoredConversations: Number(result.changes)
    };
  } finally {
    db.close();
  }
}

export async function restoreIgnoredConversations(dbPath: string) {
  const db = await ensureDatabase(dbPath);
  try {
    const restoredAt = new Date().toISOString();
    db.exec("BEGIN");
    try {
      const result = db.prepare("DELETE FROM ignored_conversations").run();
      db.prepare("UPDATE cleanup_runs SET undone_at = ? WHERE undone_at IS NULL").run(restoredAt);
      db.exec("COMMIT");
      return {
        restoredConversations: Number(result.changes)
      };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } finally {
    db.close();
  }
}

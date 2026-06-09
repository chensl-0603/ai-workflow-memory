export type SourceKind = "codex" | "claude";

export type ConversationItem = {
  id: string;
  source: SourceKind;
  title: string;
  summary: string;
  summaryOrigin: "thread-body" | "title-fallback" | "manual";
  projectPath: string | null;
  occurredAt: string;
  rawRef: string;
  tags: string[];
};

export type ProjectSnapshot = {
  path: string;
  name: string;
  techStack: string[];
  hasGit: boolean;
  scripts: string[];
  updatedAt: string;
};

export type HealthStatus = "ok" | "warn" | "fail";

export type HealthCheckResult = {
  id: string;
  label: string;
  status: HealthStatus;
  detail: string;
  suggestion: string | null;
};

export type HealthTrendKind = "ok" | "new" | "persistent" | "recovered";

export type HealthTrendPoint = HealthCheckResult & {
  checkedAt: string;
};

export type HealthTrendItem = {
  checkId: string;
  label: string;
  projectName: string | null;
  latestStatus: HealthStatus;
  latestDetail: string;
  latestSuggestion: string | null;
  latestCheckedAt: string;
  recent: HealthTrendPoint[];
  nonOkCount: number;
  trend: HealthTrendKind;
  repeated: boolean;
  summary: string;
};

export type HealthTrendReport = {
  items: HealthTrendItem[];
  summary: {
    totalChecks: number;
    repeatedAnomalies: number;
    projectsWithRepeatedAnomalies: number;
    limit: number;
  };
};

export type SourceHealthItem = {
  source: SourceKind;
  path: string;
  exists: boolean;
  itemCount: number;
  latestUpdatedAt: string | null;
  checkedAt: string;
  detail: string;
};

export type SourceHealthReport = {
  items: SourceHealthItem[];
  summary: {
    totalSources: number;
    missingSources: number;
    totalItems: number;
    staleSources: number;
  };
};

export type DailyReview = {
  date: string;
  summary: string;
  conversations: ConversationItem[];
  projects: ProjectSnapshot[];
  health: HealthCheckResult[];
};

export type AppConfig = {
  dbPath: string;
  codexIndexPath: string;
  claudeHistoryPath: string;
  claudeProjectsRoot: string;
  projectsRoot: string;
  obsidianVault: string;
};

export type MemorySearchFilters = {
  query?: string;
  source?: SourceKind | "all";
  project?: string;
  tag?: string;
  limit?: number;
};

export type MemorySearchResult = {
  items: ConversationItem[];
  availableTags: string[];
  availableProjects: string[];
};

export type MemoryQualityIssueKind = "empty" | "unstructured" | "noise" | "long";

export type MemoryQualityIssue = {
  kind: MemoryQualityIssueKind;
  label: string;
  detail: string;
};

export type MemoryBodyBackupStatus = "backed-up" | "missing" | "manual-only";

export type MemoryRecoverabilityStatus = "complete" | "recoverable" | "manual-repaired" | "source-missing" | "unknown-source";

export type MemoryQualitySignal = {
  status: MemoryBodyBackupStatus | MemoryRecoverabilityStatus;
  label: string;
  detail: string;
  suggestion: string | null;
};

export type MemoryQualityItem = {
  memory: ConversationItem;
  status: "ok" | "needs-body" | "archive-candidate" | "warn";
  summaryOrigin: "thread-body" | "title-fallback" | "manual";
  bodyBackup: MemoryQualitySignal;
  recoverability: MemoryQualitySignal;
  issues: MemoryQualityIssue[];
};

export type MemoryQualityReport = {
  items: MemoryQualityItem[];
  summary: {
    totalMemories: number;
    healthyMemories: number;
    needsBodyMemories: number;
    archiveCandidateMemories: number;
    anomalyMemories: number;
    threadBodySummaries: number;
    titleFallbackSummaries: number;
    manualSummaries: number;
    bodyBackedUpMemories: number;
    recoverableMemories: number;
    manualRepairMemories: number;
    sourceMissingMemories: number;
    emptySummary: number;
    unstructuredSummary: number;
    noisySummary: number;
    longSummary: number;
  };
};

export type TitleFallbackAction = "archive" | "manual-summary";

export type TitleFallbackReason = "archive-candidate" | "missing-project-link" | "missing-thread-body";

export type TitleFallbackDiagnostic = {
  memory: ConversationItem;
  reason: TitleFallbackReason;
  reasonLabel: string;
  detail: string;
  suggestedAction: TitleFallbackAction;
  actionLabel: string;
};

export type TitleFallbackReview = {
  items: TitleFallbackDiagnostic[];
  summary: {
    totalFallbacks: number;
    archiveCandidates: number;
    manualSummaryCandidates: number;
    missingProjectLinks: number;
    projectLinkedFallbacks: number;
  };
};

export type ArchiveCandidateKind = "command" | "greeting";

export type ArchiveCandidateItem = MemoryQualityItem & {
  candidateKind: ArchiveCandidateKind;
  candidateKindLabel: string;
  projectName: string;
};

export type ArchiveCandidateGroup = {
  key: string;
  candidateKind: ArchiveCandidateKind;
  candidateKindLabel: string;
  source: SourceKind;
  summaryOrigin: ConversationItem["summaryOrigin"];
  projectName: string;
  count: number;
  sampleTitles: string[];
};

export type ArchiveCandidateAudit = {
  items: ArchiveCandidateItem[];
  groups: ArchiveCandidateGroup[];
  summary: {
    totalCandidates: number;
    codexCandidates: number;
    claudeCandidates: number;
    commandCandidates: number;
    greetingCandidates: number;
    threadBodyCandidates: number;
    titleFallbackCandidates: number;
    manualCandidates: number;
    linkedProjectCandidates: number;
    unlinkedProjectCandidates: number;
  };
};

export type ArchiveCandidateCleanupPreview = {
  items: ArchiveCandidateItem[];
  summary: {
    matchedCandidates: number;
    sampleTitles: string[];
  };
};

export type CleanupRun = {
  id: string;
  filterLabel: string;
  ignoredCount: number;
  deletedCount: number;
  createdAt: string;
  undoneAt: string | null;
};

export type MemoryQualitySafetyStepId =
  | "export-audit"
  | "review-candidates"
  | "preview-cleanup"
  | "cleanup-candidates"
  | "undo-cleanup";

export type MemoryQualitySafetyStep = {
  id: MemoryQualitySafetyStepId;
  title: string;
  detail: string;
  status: "ready" | "done" | "blocked";
  actionLabel: string;
};

export type MemoryQualitySafetyPlan = {
  summary: string;
  nextStepId: MemoryQualitySafetyStepId | null;
  metrics: {
    archiveCandidates: number;
    keptArchiveCandidates: number;
    ignoredConversations: number;
    cleanupRuns: number;
    activeCleanupRuns: number;
    auditExported: boolean;
    auditExportedToday: boolean;
  };
  steps: MemoryQualitySafetyStep[];
};

export type ProjectDetail = {
  project: ProjectSnapshot;
  memories: ConversationItem[];
  relatedTags: string[];
  health: HealthCheckResult[];
  healthTrend: HealthTrendReport;
  memoryCoverage: ProjectMemoryCoverage;
  nextActions: string[];
};

export type ProjectMemoryCoverage = {
  status: HealthStatus;
  summary: string;
  totalMemories: number;
  threadBodyMemories: number;
  titleFallbackMemories: number;
  manualMemories: number;
  sourceMissingMemories: number;
  suggestions: string[];
};

export type ProjectKnowledgeSnapshot = {
  id: string;
  projectPath: string;
  projectName: string;
  capturedAt: string;
  summary: string;
  shippedFeatures: string[];
  currentArchitecture: string[];
  dataSources: string[];
  testSignals: string[];
  knownGaps: string[];
  nextMilestones: string[];
};

export type ProjectPhaseReviewCommit = {
  hash: string;
  message: string;
};

export type ProjectPhaseReview = {
  id: string;
  projectPath: string;
  projectName: string;
  milestone: string;
  completedAt: string;
  summary: string;
  completedItems: string[];
  verificationCommands: string[];
  commits: ProjectPhaseReviewCommit[];
  openIssues: string[];
  nextSteps: string[];
};

export type ProjectArchiveIndexItem = {
  project: ProjectSnapshot;
  archivePath: string;
  archiveExists: boolean;
  latestKnowledgeSnapshot: ProjectKnowledgeSnapshot | null;
  knowledgeStale: boolean;
  memoryCount: number;
  warningCount: number;
  nextActionCount: number;
  relatedTags: string[];
  manualNotes: string;
  manualSections: ProjectManualSections;
};

export type ProjectArchiveIndex = {
  items: ProjectArchiveIndexItem[];
  summary: {
    totalProjects: number;
    exportedProjects: number;
    totalMemories: number;
    warningProjects: number;
  };
};

export type ProjectManualSections = {
  goals: string[];
  decisions: string[];
  blockers: string[];
  notes: string[];
};

export type DecisionTimelineItem = {
  projectName: string;
  projectPath: string;
  archivePath: string;
  text: string;
};

export type DecisionTimeline = {
  items: DecisionTimelineItem[];
  summary: {
    totalDecisions: number;
    projectsWithDecisions: number;
  };
};

export type GoalBoardItem = {
  projectName: string;
  projectPath: string;
  archivePath: string;
  text: string;
};

export type GoalBoard = {
  items: GoalBoardItem[];
  summary: {
    totalGoals: number;
    projectsWithGoals: number;
  };
};

export type BlockerBoardItem = {
  projectName: string;
  projectPath: string;
  archivePath: string;
  source: "manual" | "health";
  checkId?: string;
  text: string;
  status: HealthStatus | "manual";
  suggestion: string | null;
  repeatCount?: number;
  trend?: HealthTrendKind;
};

export type BlockerBoard = {
  items: BlockerBoardItem[];
  summary: {
    totalBlockers: number;
    manualBlockers: number;
    healthBlockers: number;
    projectsWithBlockers: number;
  };
};

export type DailyActionKind = "blocker" | "archive" | "memory" | "health";
export type DailyActionStatus = "open" | "done" | "skipped" | "snoozed";
export type DailyActionPriority = "high" | "medium" | "low";
export type DailyActionEvidenceKind = "commit" | "test" | "sync" | "manual";
export type DailyActionEvidenceStatus = "ok" | "fail" | "unknown";

export type DailyActionEvidence = {
  kind: DailyActionEvidenceKind;
  label: string;
  detail: string;
  ref: string | null;
  status: DailyActionEvidenceStatus;
  recordedAt: string;
};

export type DailyActionItem = {
  id: string;
  kind: DailyActionKind;
  priority: DailyActionPriority;
  title: string;
  detail: string;
  reason: string;
  completionEvidence: string;
  href: string;
  projectName: string | null;
  status: DailyActionStatus;
  evidence: DailyActionEvidence[];
  evidenceSource: string | null;
  completedAt: string | null;
};

export type DailyActions = {
  items: DailyActionItem[];
  summary: {
    totalActions: number;
    openActions: number;
    completedActions: number;
    date: string;
  };
};

export type DailyProjectProgress = {
  projectName: string;
  projectPath: string | null;
  conversationCount: number;
  latestTitle: string;
  latestAt: string;
  tags: string[];
};

export type DailyRepeatedBlocker = {
  key: string;
  projectName: string;
  title: string;
  detail: string;
  href: string;
  priority: DailyActionPriority;
  status: DailyActionStatus;
  count: number;
  dates: string[];
  latestDate: string;
  reason: string;
};

export type DailyFocus = {
  projectProgress: DailyProjectProgress[];
  repeatedBlockers: DailyRepeatedBlocker[];
  nextSteps: DailyActionItem[];
  completedActions: DailyActionItem[];
  summary: {
    progressedProjects: number;
    repeatedBlockers: number;
    nextSteps: number;
    completedActions: number;
  };
};

export type DailyPayload = DailyReview & {
  actions: DailyActions;
  focus: DailyFocus;
};

export type ReviewHistoryItem = {
  date: string;
  conversationCount: number;
  actionCount: number;
  exported: boolean;
  exportedPath: string;
};

export type ReviewHistory = {
  items: ReviewHistoryItem[];
  summary: {
    totalDays: number;
    exportedDays: number;
    totalConversations: number;
    daysWithActions: number;
  };
};

export type ActionInboxItem = DailyActionItem & {
  date: string;
};

export type ActionInboxEscalation = {
  level: "blocker" | "risk" | null;
  reason: string | null;
};

export type ActionInboxGroup = {
  key: string;
  kind: DailyActionKind;
  title: string;
  detail: string;
  href: string;
  projectName: string | null;
  priority: DailyActionPriority;
  reason: string;
  completionEvidence: string;
  status: DailyActionStatus;
  evidence: DailyActionEvidence[];
  evidenceSource: string | null;
  completedAt: string | null;
  escalation: ActionInboxEscalation;
  latestDate: string;
  dates: string[];
  count: number;
};

export type ActionInbox = {
  items: ActionInboxItem[];
  completedItems: ActionInboxItem[];
  groups: ActionInboxGroup[];
  summary: {
    totalActions: number;
    groupedActions: number;
    openActions: number;
    snoozedActions: number;
    completedActions: number;
    datesWithActions: number;
  };
};

export type ProjectStrategyItem = {
  project: ProjectSnapshot;
  archivePath: string;
  latestKnowledgeSnapshot: ProjectKnowledgeSnapshot | null;
  goals: string[];
  decisions: string[];
  blockers: BlockerBoardItem[];
  actions: ActionInboxGroup[];
  memoryCount: number;
  warningCount: number;
};

export type StrategyBoard = {
  items: ProjectStrategyItem[];
  summary: {
    totalProjects: number;
    projectsWithGoals: number;
    projectsWithDecisions: number;
    projectsWithBlockers: number;
    projectsWithActions: number;
  };
};

export type SyncTargetKind = "daily" | "actions" | "strategy" | "project";

export type SyncTargetStatus = {
  kind: SyncTargetKind;
  label: string;
  path: string;
  exists: boolean;
  sizeBytes: number;
  updatedAt: string | null;
};

export type SyncStatus = {
  date: string;
  targets: SyncTargetStatus[];
  summary: {
    totalTargets: number;
    existingTargets: number;
    missingTargets: number;
    totalSizeBytes: number;
  };
};

export type SyncRunStatus = "ok" | "fail";
export type SyncRunStatusFilter = SyncRunStatus | "all";

export type SyncStage = "daily" | "actions" | "strategy" | "projects";

export type SyncFailureCode = "permission-denied" | "vault-path-conflict" | "path-not-found" | "database-busy" | "unknown";

export type SyncFailureDiagnosis = {
  code: SyncFailureCode;
  stage: SyncStage;
  title: string;
  suggestion: string;
};

export type SyncRun = {
  id: string;
  date: string;
  status: SyncRunStatus;
  projectCount: number;
  message: string;
  diagnosis: SyncFailureDiagnosis | null;
  ranAt: string;
  snapshotSummary?: SyncRunSnapshotSummary;
};

export type SyncSnapshotPhase = "before" | "after" | "failure";

export type SyncRunSnapshotSummary = {
  beforeTargets: number;
  afterTargets: number;
  failureTargets: number;
  changedTargets: number;
};

export type SyncTargetSnapshot = SyncTargetStatus & {
  id: string;
  syncRunId: string;
  phase: SyncSnapshotPhase;
  capturedAt: string;
};

export type SyncSnapshotReport = {
  items: SyncTargetSnapshot[];
  summary: {
    totalSnapshots: number;
    beforeExistingTargets: number;
    afterExistingTargets: number;
    failureExistingTargets: number;
    changedTargets: number;
  };
};

export type SyncFailureCodeCount = {
  code: SyncFailureCode;
  count: number;
};

export type SyncAudit = {
  items: SyncRun[];
  summary: {
    totalRuns: number;
    okRuns: number;
    failedRuns: number;
    shownRuns: number;
    latestStatus: SyncRunStatus | null;
    statusFilter: SyncRunStatusFilter;
    limit: number;
    failureCodes: SyncFailureCodeCount[];
  };
};

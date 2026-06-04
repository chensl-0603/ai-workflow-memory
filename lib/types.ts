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

export type MemoryQualityItem = {
  memory: ConversationItem;
  status: "ok" | "needs-body" | "archive-candidate" | "warn";
  summaryOrigin: "thread-body" | "title-fallback" | "manual";
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
  nextActions: string[];
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
  text: string;
  status: HealthStatus | "manual";
  suggestion: string | null;
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
};

export type DailyActions = {
  items: DailyActionItem[];
  summary: {
    totalActions: number;
    openActions: number;
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
  summary: {
    progressedProjects: number;
    repeatedBlockers: number;
    nextSteps: number;
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
  latestDate: string;
  dates: string[];
  count: number;
};

export type ActionInbox = {
  items: ActionInboxItem[];
  groups: ActionInboxGroup[];
  summary: {
    totalActions: number;
    groupedActions: number;
    openActions: number;
    snoozedActions: number;
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

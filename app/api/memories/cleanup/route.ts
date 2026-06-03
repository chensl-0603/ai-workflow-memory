import { NextRequest, NextResponse } from "next/server";

import { cleanupArchiveCandidateMemories, previewArchiveCandidateCleanup } from "../../../../lib/memory-quality.ts";
import { defaultConfig } from "../../../../lib/paths.ts";
import type { ArchiveCandidateKind, ConversationItem, SourceKind } from "../../../../lib/types.ts";

type CleanupFilters = {
  source?: SourceKind;
  summaryOrigin?: ConversationItem["summaryOrigin"];
  candidateKind?: ArchiveCandidateKind;
  projectName?: string;
};

function parseCleanupFilters(body: { source?: string; summaryOrigin?: string; candidateKind?: string; projectName?: string }):
  | { error: string }
  | { filters: CleanupFilters } {
  if (body.source && body.source !== "codex" && body.source !== "claude") {
    return { error: "Unsupported memory source" };
  }
  if (body.summaryOrigin && body.summaryOrigin !== "title-fallback" && body.summaryOrigin !== "thread-body" && body.summaryOrigin !== "manual") {
    return { error: "Unsupported summary origin" };
  }
  if (body.candidateKind && body.candidateKind !== "command" && body.candidateKind !== "greeting") {
    return { error: "Unsupported candidate kind" };
  }
  const source: SourceKind | undefined = body.source === "codex" || body.source === "claude" ? body.source : undefined;
  const summaryOrigin: ConversationItem["summaryOrigin"] | undefined =
    body.summaryOrigin === "title-fallback" || body.summaryOrigin === "thread-body" || body.summaryOrigin === "manual"
      ? body.summaryOrigin
      : undefined;
  const candidateKind: ArchiveCandidateKind | undefined =
    body.candidateKind === "command" || body.candidateKind === "greeting" ? body.candidateKind : undefined;
  return {
    filters: {
      source,
      summaryOrigin,
      candidateKind,
      projectName: typeof body.projectName === "string" && body.projectName.trim() ? body.projectName.trim() : undefined
    }
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      source?: string;
      summaryOrigin?: string;
      candidateKind?: string;
      projectName?: string;
    };
    const parsed = parseCleanupFilters(body);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const result = await cleanupArchiveCandidateMemories(defaultConfig.dbPath, parsed.filters);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String((error as Error).message) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      source?: string;
      summaryOrigin?: string;
      candidateKind?: string;
      projectName?: string;
    };
    const parsed = parseCleanupFilters(body);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const result = await previewArchiveCandidateCleanup(defaultConfig.dbPath, parsed.filters);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String((error as Error).message) }, { status: 500 });
  }
}

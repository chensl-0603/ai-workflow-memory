import { NextRequest, NextResponse } from "next/server";

import { restoreIgnoredConversation, restoreIgnoredConversations, undoCleanupRun, undoLatestCleanupRun } from "../../../../lib/memory-quality.ts";
import { defaultConfig } from "../../../../lib/paths.ts";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { id?: string; mode?: string; cleanupRunId?: string };
    if (body.mode === "latest-cleanup") {
      return NextResponse.json(await undoLatestCleanupRun(defaultConfig.dbPath));
    }
    if (body.cleanupRunId) {
      return NextResponse.json(await undoCleanupRun(defaultConfig.dbPath, body.cleanupRunId));
    }
    if (body.id) {
      return NextResponse.json(await restoreIgnoredConversation(defaultConfig.dbPath, body.id));
    }
    const result = await restoreIgnoredConversations(defaultConfig.dbPath);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String((error as Error).message) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";

import { setDailyActionStatus } from "../../../../lib/action-status.ts";
import { defaultConfig, toDateKey } from "../../../../lib/paths.ts";
import type { DailyActionEvidence, DailyActionStatus } from "../../../../lib/types.ts";

const validStatuses = new Set<DailyActionStatus>(["open", "done", "skipped", "snoozed"]);

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      date?: string;
      actionId?: string;
      status?: DailyActionStatus;
      evidence?: DailyActionEvidence[];
      evidenceSource?: string | null;
      completedAt?: string | null;
    };
    const date = body.date ?? toDateKey(new Date());
    if (!body.actionId) {
      return NextResponse.json({ error: "Missing actionId" }, { status: 400 });
    }
    if (!body.status || !validStatuses.has(body.status)) {
      return NextResponse.json({ error: "Unsupported action status" }, { status: 400 });
    }

    await setDailyActionStatus({
      dbPath: defaultConfig.dbPath,
      date,
      actionId: body.actionId,
      status: body.status,
      evidence: body.evidence,
      evidenceSource: body.evidenceSource,
      completedAt: body.completedAt
    });

    return NextResponse.json({
      date,
      actionId: body.actionId,
      status: body.status
    });
  } catch (error) {
    return NextResponse.json({ error: String((error as Error).message) }, { status: 500 });
  }
}

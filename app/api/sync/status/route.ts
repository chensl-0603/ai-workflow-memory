import { NextRequest, NextResponse } from "next/server";

import { defaultConfig, toDateKey } from "../../../../lib/paths.ts";
import { getSyncAudit, getSyncStatus } from "../../../../lib/sync.ts";
import type { SyncRunStatusFilter } from "../../../../lib/types.ts";

function parseStatus(value: string | null): SyncRunStatusFilter {
  return value === "ok" || value === "fail" ? value : "all";
}

function parseLimit(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 10;
}

export async function GET(request: NextRequest) {
  try {
    const today = request.nextUrl.searchParams.get("today") ?? toDateKey(new Date());
    const syncStatus = parseStatus(request.nextUrl.searchParams.get("syncStatus"));
    const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
    const [status, audit] = await Promise.all([
      getSyncStatus({
        dbPath: defaultConfig.dbPath,
        obsidianVault: defaultConfig.obsidianVault,
        today
      }),
      getSyncAudit({
        dbPath: defaultConfig.dbPath,
        status: syncStatus,
        limit
      })
    ]);
    return NextResponse.json({ status, runs: audit.items, audit });
  } catch (error) {
    return NextResponse.json({ error: String((error as Error).message) }, { status: 500 });
  }
}

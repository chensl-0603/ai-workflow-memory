import { NextRequest, NextResponse } from "next/server";

import { exportDailyReviewToObsidian } from "../../../../lib/obsidian.ts";
import { defaultConfig, toDateKey } from "../../../../lib/paths.ts";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { date?: string };
    const date = body.date ?? toDateKey(new Date());
    const exportedPath = await exportDailyReviewToObsidian({
      dbPath: defaultConfig.dbPath,
      obsidianVault: defaultConfig.obsidianVault,
      date
    });
    return NextResponse.json({ path: exportedPath });
  } catch (error) {
    return NextResponse.json({ error: String((error as Error).message) }, { status: 500 });
  }
}

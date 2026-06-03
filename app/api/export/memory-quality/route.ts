import { NextRequest, NextResponse } from "next/server";

import { exportMemoryQualityAuditToObsidian } from "../../../../lib/obsidian.ts";
import { defaultConfig, toDateKey } from "../../../../lib/paths.ts";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { today?: string };
    const exportedPath = await exportMemoryQualityAuditToObsidian({
      dbPath: defaultConfig.dbPath,
      obsidianVault: defaultConfig.obsidianVault,
      today: body.today ?? toDateKey(new Date())
    });
    return NextResponse.json({ path: exportedPath });
  } catch (error) {
    return NextResponse.json({ error: String((error as Error).message) }, { status: 500 });
  }
}

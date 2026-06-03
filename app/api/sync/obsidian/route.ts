import { NextRequest, NextResponse } from "next/server";

import { defaultConfig, toDateKey } from "../../../../lib/paths.ts";
import { syncObsidian } from "../../../../lib/sync.ts";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { today?: string };
    const result = await syncObsidian({
      dbPath: defaultConfig.dbPath,
      obsidianVault: defaultConfig.obsidianVault,
      today: body.today ?? toDateKey(new Date())
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String((error as Error).message) }, { status: 500 });
  }
}

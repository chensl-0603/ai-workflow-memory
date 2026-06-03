import { NextRequest, NextResponse } from "next/server";

import { getDailyPayload } from "../../../lib/daily-payload.ts";
import { defaultConfig, toDateKey } from "../../../lib/paths.ts";

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") ?? toDateKey(new Date());
  try {
    const payload = await getDailyPayload({
      dbPath: defaultConfig.dbPath,
      obsidianVault: defaultConfig.obsidianVault,
      date
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: String((error as Error).message) }, { status: 500 });
  }
}

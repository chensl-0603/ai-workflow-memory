import { NextRequest, NextResponse } from "next/server";

import { defaultConfig } from "../../../lib/paths.ts";
import { searchMemories } from "../../../lib/search.ts";
import type { SourceKind } from "../../../lib/types.ts";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const source = searchParams.get("source");
  try {
    const result = await searchMemories(defaultConfig.dbPath, {
      query: searchParams.get("q") ?? undefined,
      source: source === "codex" || source === "claude" ? (source as SourceKind) : "all",
      project: searchParams.get("project") ?? undefined,
      tag: searchParams.get("tag") ?? undefined,
      limit: 100
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String((error as Error).message) }, { status: 500 });
  }
}

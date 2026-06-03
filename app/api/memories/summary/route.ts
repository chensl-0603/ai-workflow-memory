import { NextRequest, NextResponse } from "next/server";

import { resetManualMemorySummary, saveManualMemorySummary } from "../../../../lib/memory-quality.ts";
import { defaultConfig } from "../../../../lib/paths.ts";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { id?: string; summary?: string };
    if (!body.id) {
      return NextResponse.json({ error: "Missing memory id" }, { status: 400 });
    }
    if (!body.summary?.trim()) {
      return NextResponse.json({ error: "Missing summary" }, { status: 400 });
    }

    const result = await saveManualMemorySummary(defaultConfig.dbPath, {
      id: body.id,
      summary: body.summary
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String((error as Error).message) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { id?: string };
    if (!body.id) {
      return NextResponse.json({ error: "Missing memory id" }, { status: 400 });
    }

    const result = await resetManualMemorySummary(defaultConfig.dbPath, {
      id: body.id
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String((error as Error).message) }, { status: 500 });
  }
}

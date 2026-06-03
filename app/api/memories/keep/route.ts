import { NextRequest, NextResponse } from "next/server";

import { keepArchiveCandidate, unkeepArchiveCandidate } from "../../../../lib/memory-quality.ts";
import { defaultConfig } from "../../../../lib/paths.ts";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { id?: string; reason?: string };
    if (!body.id) {
      return NextResponse.json({ error: "Missing memory id" }, { status: 400 });
    }
    const result = await keepArchiveCandidate(defaultConfig.dbPath, body.id, body.reason ?? "");
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
    const result = await unkeepArchiveCandidate(defaultConfig.dbPath, body.id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String((error as Error).message) }, { status: 500 });
  }
}

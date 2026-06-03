import { NextResponse } from "next/server";

import { ingestAllSources } from "../../../lib/ingest.ts";
import { defaultConfig } from "../../../lib/paths.ts";

export async function POST() {
  try {
    const result = await ingestAllSources(defaultConfig);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String((error as Error).message) }, { status: 500 });
  }
}

import { NextResponse } from "next/server";

import { exportAllProjectArchives } from "../../../../lib/project-archives.ts";
import { defaultConfig } from "../../../../lib/paths.ts";

export async function POST() {
  try {
    const result = await exportAllProjectArchives({
      dbPath: defaultConfig.dbPath,
      obsidianVault: defaultConfig.obsidianVault
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String((error as Error).message) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";

import { exportProjectArchiveToObsidian } from "../../../../lib/obsidian.ts";
import { defaultConfig } from "../../../../lib/paths.ts";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { projectName?: string };
    const projectName = body.projectName?.trim();
    if (!projectName) {
      return NextResponse.json({ error: "Project name is required" }, { status: 400 });
    }

    const exportedPath = await exportProjectArchiveToObsidian({
      dbPath: defaultConfig.dbPath,
      obsidianVault: defaultConfig.obsidianVault,
      projectName
    });
    if (!exportedPath) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json({ path: exportedPath });
  } catch (error) {
    return NextResponse.json({ error: String((error as Error).message) }, { status: 500 });
  }
}

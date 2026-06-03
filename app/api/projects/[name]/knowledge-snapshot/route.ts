import { NextRequest, NextResponse } from "next/server";

import { generateProjectKnowledgeSnapshot } from "../../../../../lib/project-knowledge.ts";
import { defaultConfig } from "../../../../../lib/paths.ts";

type RouteParams = Promise<{
  name: string;
}>;

export async function POST(_request: NextRequest, { params }: { params: RouteParams }) {
  try {
    const { name } = await params;
    const snapshot = await generateProjectKnowledgeSnapshot({
      dbPath: defaultConfig.dbPath,
      obsidianVault: defaultConfig.obsidianVault,
      projectName: decodeURIComponent(name)
    });
    if (!snapshot) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json({ snapshot });
  } catch (error) {
    return NextResponse.json({ error: String((error as Error).message) }, { status: 500 });
  }
}

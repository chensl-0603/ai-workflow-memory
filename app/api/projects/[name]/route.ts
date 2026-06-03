import { NextResponse } from "next/server";

import { defaultConfig } from "../../../../lib/paths.ts";
import { getProjectDetail } from "../../../../lib/project-detail.ts";

type RouteContext = {
  params: Promise<{
    name: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { name } = await context.params;
  try {
    const detail = await getProjectDetail(defaultConfig.dbPath, decodeURIComponent(name));
    if (!detail) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (error) {
    return NextResponse.json({ error: String((error as Error).message) }, { status: 500 });
  }
}

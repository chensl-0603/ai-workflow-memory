import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { ProjectSnapshot } from "./types.ts";

async function exists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readPackageScripts(packageJsonPath: string) {
  try {
    const pkg = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const scripts = pkg.scripts ?? {};
    const scriptText = Object.values(scripts).join("\n");
    const tech = new Set<string>();
    if (deps.next || /\bnext\b/.test(scriptText)) tech.add("Next.js");
    if (deps.react) tech.add("React");
    tech.add("Node.js");
    return {
      scripts: Object.keys(scripts).sort(),
      techStack: Array.from(tech)
    };
  } catch {
    return { scripts: [], techStack: ["Node.js"] };
  }
}

export async function scanProjects(projectsRoot: string): Promise<ProjectSnapshot[]> {
  try {
    const entries = await readdir(projectsRoot, { withFileTypes: true });
    const projects = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const projectPath = path.join(projectsRoot, entry.name);
          const packageJsonPath = path.join(projectPath, "package.json");
          const pomPath = path.join(projectPath, "pom.xml");
          const hasPackageJson = await exists(packageJsonPath);
          const hasPom = await exists(pomPath);
          const hasGit = await exists(path.join(projectPath, ".git"));
          const info = await stat(projectPath);

          let techStack = ["未识别"];
          let scripts: string[] = [];

          if (hasPackageJson) {
            const packageInfo = await readPackageScripts(packageJsonPath);
            techStack = packageInfo.techStack;
            scripts = packageInfo.scripts;
          } else if (hasPom) {
            techStack = ["Maven", "Java"];
          }

          return {
            path: projectPath,
            name: entry.name,
            techStack,
            hasGit,
            scripts,
            updatedAt: info.mtime.toISOString()
          } satisfies ProjectSnapshot;
        })
    );

    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

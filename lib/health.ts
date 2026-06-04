import { readFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

import type { HealthCheckResult, ProjectSnapshot } from "./types.ts";

export type CommandCheck = {
  id: string;
  label: string;
  command: string;
  args: string[];
  required: boolean;
  cwd?: string;
};

export type HealthOptions = {
  envFiles?: (string | EnvFileCheck)[];
  commands?: CommandCheck[];
  files?: FileCheck[];
};

export type EnvFileCheck = {
  id: string;
  label: string;
  path: string;
};

export type FileCheck = {
  id: string;
  label: string;
  paths: string[];
  missingDetail: string;
  suggestion: string;
  required?: boolean;
};

const defaultCommands: CommandCheck[] = [
  { id: "node", label: "Node.js", command: "node", args: ["--version"], required: true },
  { id: "npm", label: "npm", command: "npm", args: ["--version"], required: true },
  { id: "python", label: "Python", command: "python", args: ["--version"], required: false },
  { id: "java", label: "Java", command: "java", args: ["-version"], required: false },
  { id: "gradle", label: "Gradle", command: "gradle", args: ["--version"], required: false }
];

function runCommand(check: CommandCheck): Promise<HealthCheckResult> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawnCheckCommand(check);
    } catch {
      resolve(unavailableResult(check));
      return;
    }
    let output = "";
    child.stdout?.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      output += String(chunk);
    });
    child.on("error", () => {
      resolve(unavailableResult(check));
    });
    child.on("close", (code) => {
      const detail = output.trim().split(/\r?\n/)[0] || `退出码 ${code}`;
      resolve({
        id: check.id,
        label: check.label,
        status: code === 0 ? "ok" : check.required ? "fail" : "warn",
        detail,
        suggestion: code === 0 ? null : `检查 ${check.label} 是否在 PATH 中`
      });
    });
  });
}

function spawnCheckCommand(check: CommandCheck) {
  if (process.platform !== "win32") {
    return spawn(check.command, check.args, { cwd: check.cwd, shell: false });
  }

  const commandLine = [check.command, ...check.args].map(quoteWindowsArg).join(" ");
  return spawn("cmd.exe", ["/d", "/c", commandLine], { cwd: check.cwd, shell: false });
}

function unavailableResult(check: CommandCheck): HealthCheckResult {
  return {
    id: check.id,
    label: check.label,
    status: check.required ? "fail" : "warn",
    detail: "命令不可用",
    suggestion: check.required ? `安装或修复 ${check.label}` : `需要时再安装 ${check.label}`
  };
}

function quoteWindowsArg(value: string) {
  if (/^[\w.:/\\-]+$/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

function normalizeEnvFile(value: string | EnvFileCheck, index: number): EnvFileCheck {
  if (typeof value !== "string") return value;
  return {
    id: `env:CUSTOM_${index}`,
    label: "环境变量文件",
    path: value
  };
}

async function checkEnvFile(value: string | EnvFileCheck, index: number): Promise<HealthCheckResult> {
  const envFile = normalizeEnvFile(value, index);
  try {
    const content = await readFile(envFile.path, "utf8");
    const keys = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => line.slice(0, line.indexOf("=")).trim())
      .filter(Boolean);
    return {
      id: envFile.id,
      label: envFile.label,
      status: "ok",
      detail: keys.length > 0 ? `存在 ${keys.length} 个变量名：${keys.join(", ")}` : "文件存在，但没有变量名",
      suggestion: null
    };
  } catch {
    return {
      id: envFile.id,
      label: envFile.label,
      status: "warn",
      detail: `未找到 ${envFile.path}`,
      suggestion: "如果项目需要密钥，请创建本地环境变量文件"
    };
  }
}

async function checkFile(value: FileCheck): Promise<HealthCheckResult> {
  for (const filePath of value.paths) {
    try {
      await stat(filePath);
      return {
        id: value.id,
        label: value.label,
        status: "ok",
        detail: `已找到 ${filePath}`,
        suggestion: null
      };
    } catch {
    }
  }

  return {
    id: value.id,
    label: value.label,
    status: value.required ? "fail" : "warn",
    detail: value.missingDetail,
    suggestion: value.suggestion
  };
}

function projectHasTech(project: ProjectSnapshot, tech: string) {
  return project.techStack.some((item) => item.toLocaleLowerCase("zh-CN") === tech.toLocaleLowerCase("zh-CN"));
}

function projectToolCheck(project: ProjectSnapshot, tool: {
  id: string;
  label: string;
  command: string;
  args: string[];
  required: boolean;
}): CommandCheck {
  return {
    id: `tool:${project.name}:${tool.id}`,
    label: `${project.name} ${tool.label}`,
    command: tool.command,
    args: tool.args,
    required: tool.required,
    cwd: project.path
  };
}

function buildProjectCommandChecks(project: ProjectSnapshot): CommandCheck[] {
  const checks: CommandCheck[] = [];
  if (projectHasTech(project, "Node.js") || projectHasTech(project, "Next.js")) {
    checks.push(
      projectToolCheck(project, { id: "node", label: "Node.js", command: "node", args: ["--version"], required: true }),
      projectToolCheck(project, { id: "npm", label: "npm", command: "npm", args: ["--version"], required: true })
    );
  }
  if (projectHasTech(project, "Python")) {
    checks.push(projectToolCheck(project, { id: "python", label: "Python", command: "python", args: ["--version"], required: true }));
  }
  if (projectHasTech(project, "Java")) {
    checks.push(projectToolCheck(project, { id: "java", label: "Java", command: "java", args: ["-version"], required: true }));
  }
  if (projectHasTech(project, "Maven")) {
    checks.push(projectToolCheck(project, { id: "maven", label: "Maven", command: "mvn", args: ["--version"], required: true }));
  }
  if (projectHasTech(project, "Gradle")) {
    checks.push(projectToolCheck(project, { id: "gradle", label: "Gradle", command: "gradle", args: ["--version"], required: true }));
  }
  return checks;
}

function buildProjectFileChecks(project: ProjectSnapshot): FileCheck[] {
  const checks: FileCheck[] = [];
  if (projectHasTech(project, "Maven")) {
    checks.push({
      id: `file:${project.name}:maven-wrapper`,
      label: `${project.name} Maven wrapper`,
      paths: [path.join(project.path, "mvnw"), path.join(project.path, "mvnw.cmd")],
      missingDetail: "未找到 mvnw 或 mvnw.cmd",
      suggestion: "补充 Maven wrapper，避免只依赖本机全局 Maven"
    });
  }
  if (projectHasTech(project, "Gradle")) {
    checks.push({
      id: `file:${project.name}:gradle-wrapper`,
      label: `${project.name} Gradle wrapper`,
      paths: [path.join(project.path, "gradlew"), path.join(project.path, "gradlew.bat")],
      missingDetail: "未找到 gradlew 或 gradlew.bat",
      suggestion: "补充 Gradle wrapper，避免只依赖本机全局 Gradle"
    });
  }
  return checks;
}

function buildProjectEnvChecks(projects: ProjectSnapshot[]): EnvFileCheck[] {
  return projects
    .filter((project) => projectHasTech(project, "Next.js") || projectHasTech(project, "Node.js"))
    .map((project) => ({
      id: `env:${project.name}`,
      label: `${project.name} 环境变量文件`,
      path: path.join(project.path, ".env.local")
    }));
}

export function buildProjectHealthOptions(projects: ProjectSnapshot[]): HealthOptions {
  return {
    commands: projects.flatMap(buildProjectCommandChecks),
    envFiles: buildProjectEnvChecks(projects),
    files: projects.flatMap(buildProjectFileChecks)
  };
}

export function projectNameFromHealthCheckId(id: string) {
  if (id.startsWith("env:")) return id.slice("env:".length);
  const prefix = id.startsWith("tool:") ? "tool:" : id.startsWith("file:") ? "file:" : null;
  if (!prefix) return null;
  const rest = id.slice(prefix.length);
  const delimiter = rest.lastIndexOf(":");
  if (delimiter <= 0) return null;
  return rest.slice(0, delimiter);
}

export async function runHealthChecks(options: HealthOptions = {}): Promise<HealthCheckResult[]> {
  const commands = options.commands ?? defaultCommands;
  const envFiles = options.envFiles ?? [];
  const files = options.files ?? [];
  const [commandChecks, envChecks, fileChecks] = await Promise.all([
    Promise.all(commands.map(runCommand)),
    Promise.all(envFiles.map(checkEnvFile)),
    Promise.all(files.map(checkFile))
  ]);
  return [...commandChecks, ...envChecks, ...fileChecks];
}

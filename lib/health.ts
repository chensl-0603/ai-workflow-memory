import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

import type { HealthCheckResult } from "./types.ts";

export type CommandCheck = {
  id: string;
  label: string;
  command: string;
  args: string[];
  required: boolean;
};

export type HealthOptions = {
  envFiles?: (string | EnvFileCheck)[];
  commands?: CommandCheck[];
};

export type EnvFileCheck = {
  id: string;
  label: string;
  path: string;
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
    return spawn(check.command, check.args, { shell: false });
  }

  const commandLine = [check.command, ...check.args].map(quoteWindowsArg).join(" ");
  return spawn("cmd.exe", ["/d", "/c", commandLine], { shell: false });
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

export async function runHealthChecks(options: HealthOptions = {}): Promise<HealthCheckResult[]> {
  const commands = options.commands ?? defaultCommands;
  const envFiles = options.envFiles ?? [];
  const [commandChecks, envChecks] = await Promise.all([
    Promise.all(commands.map(runCommand)),
    Promise.all(envFiles.map(checkEnvFile))
  ]);
  return [...commandChecks, ...envChecks];
}

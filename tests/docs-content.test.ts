import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

async function readProjectFile(...parts: string[]) {
  return readFile(path.join(root, ...parts), "utf8");
}

test("README documents positioning, setup, Obsidian sync, and verification commands", async () => {
  const readme = await readProjectFile("README.md");

  for (const required of [
    "项目定位",
    "安装",
    "运行",
    "同步 Obsidian",
    "测试命令",
    "npm install",
    "npm run dev",
    "npm test",
    "npm run lint",
    "npm run build",
    ".env.example",
    "AIWM_OBSIDIAN_VAULT"
  ]) {
    assert.match(readme, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("docs include product roadmap and SQLite data model", async () => {
  const roadmap = await readProjectFile("docs", "product-roadmap.md");
  const dataModel = await readProjectFile("docs", "data-model.md");

  for (const required of ["产品路线", "三条主线", "小目标 10", "记忆管理", "项目管理复盘", "开发环境监测"]) {
    assert.match(roadmap, new RegExp(required));
  }
  for (const required of [
    "SQLite",
    "Obsidian",
    "conversations",
    "project_snapshots",
    "project_phase_reviews",
    "daily_action_statuses",
    "health_check_history",
    "sync_runs"
  ]) {
    assert.match(dataModel, new RegExp(required));
  }
});

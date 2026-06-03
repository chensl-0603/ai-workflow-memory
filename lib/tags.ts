import type { ConversationItem } from "./types.ts";

const tagRules: Array<{ tag: string; patterns: RegExp[] }> = [
  { tag: "Agent", patterns: [/agent/i, /codex/i, /claude/i, /skill/i, /插件|工作流记忆/] },
  { tag: "OAuth", patterns: [/oauth/i, /callback/i, /回调|登录|auth/i] },
  { tag: "前端", patterns: [/前端|页面|首页|布局|视觉|设计|UI/i, /next/i, /react/i] },
  { tag: "构建", patterns: [/构建|编译|gradle|maven|JAVA_HOME|build/i] },
  { tag: "环境", patterns: [/环境|JAVA_HOME|PATH|端口|报错|not set|gradle/i] },
  { tag: "GitHub", patterns: [/github/i] },
  { tag: "部署", patterns: [/部署|公网|本地|ngrok|production|callback/i] },
  { tag: "数据库", patterns: [/数据库|sqlite|prisma|mysql|mariadb|room/i] },
  { tag: "Obsidian", patterns: [/obsidian/i] },
  { tag: "游戏", patterns: [/游戏|farmgame|android|kotlin|compose/i] },
  { tag: "论文", patterns: [/论文|参考文献|pdf|报告/i] }
];

export function tagConversation(item: Pick<ConversationItem, "title" | "projectPath" | "source">) {
  const text = `${item.title} ${item.projectPath ?? ""} ${item.source}`;
  return tagRules
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(text)))
    .map((rule) => rule.tag)
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
}

import { AppNav } from "../nav";
import { SyncConsole } from "./sync-console";
import { defaultConfig, toDateKey } from "../../lib/paths.ts";
import { getSyncAudit, getSyncStatus } from "../../lib/sync.ts";

export const dynamic = "force-dynamic";

export default async function SyncPage() {
  const today = toDateKey(new Date());
  const [status, audit] = await Promise.all([
    getSyncStatus({
      dbPath: defaultConfig.dbPath,
      obsidianVault: defaultConfig.obsidianVault,
      today
    }),
    getSyncAudit({
      dbPath: defaultConfig.dbPath,
      status: "all",
      limit: 10
    })
  ]);

  return (
    <>
      <AppNav />
      <main className="workspace">
        <header className="page-header">
          <div>
            <p className="eyebrow">Sync Center</p>
            <h1>
              同步中心
              <br />
              <span>把本地复盘一次性写进 Obsidian。</span>
            </h1>
          </div>
          <p>集中导出 Daily、行动收件箱、项目战略面板和全部项目档案。Markdown 仍然只是可再生成视图，SQLite 是事实源。</p>
        </header>

        <SyncConsole today={today} initialAudit={audit} initialStatus={status} />

        <section className="panel">
          <div className="section-heading">
            <h2>同步内容</h2>
          </div>
          <div className="sync-target-grid">
            <article>
              <span>Daily</span>
              <strong>每日复盘</strong>
              <p>今日摘要、行动建议、对话记忆、项目进展和环境提醒。</p>
            </article>
            <article>
              <span>Actions</span>
              <strong>行动收件箱</strong>
              <p>跨日期未完成行动分组，保留延后状态和重复次数。</p>
            </article>
            <article>
              <span>Strategy</span>
              <strong>项目战略面板</strong>
              <p>按项目聚合目标、决策、阻塞和未完成行动。</p>
            </article>
            <article>
              <span>Projects</span>
              <strong>项目档案</strong>
              <p>每个本地项目的技术栈、记忆、提醒和手动备注承接区。</p>
            </article>
          </div>
        </section>

      </main>
    </>
  );
}

import { EmptyState } from "../empty-state";
import { AppNav } from "../nav";
import { defaultConfig } from "../../lib/paths.ts";
import { searchMemories } from "../../lib/search.ts";
import type { SourceKind } from "../../lib/types.ts";

type SearchParams = Promise<{
  q?: string;
  source?: string;
  project?: string;
  tag?: string;
}>;

export default async function MemoriesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const source = params.source === "codex" || params.source === "claude" ? (params.source as SourceKind) : "all";
  const result = await searchMemories(defaultConfig.dbPath, {
    query: params.q,
    source,
    project: params.project,
    tag: params.tag,
    limit: 100
  });

  return (
    <>
      <AppNav />
      <main className="workspace">
        <header className="page-header">
          <div>
            <p className="eyebrow">Codex / Claude</p>
            <h1>记忆流</h1>
          </div>
          <p>跨日期检索本地对话记忆，用关键词、来源、项目和标签快速找回上下文。</p>
        </header>

        <form className="memory-filters">
          <label>
            <span>关键词</span>
            <input name="q" defaultValue={params.q ?? ""} placeholder="OAuth、前端、JAVA_HOME..." />
          </label>
          <label>
            <span>来源</span>
            <select name="source" defaultValue={source}>
              <option value="all">全部</option>
              <option value="codex">Codex</option>
              <option value="claude">Claude</option>
            </select>
          </label>
          <label>
            <span>标签</span>
            <select name="tag" defaultValue={params.tag ?? ""}>
              <option value="">全部标签</option>
              {result.availableTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>项目</span>
            <select name="project" defaultValue={params.project ?? ""}>
              <option value="">全部项目</option>
              {result.availableProjects.map((project) => (
                <option key={project} value={project}>
                  {project}
                </option>
              ))}
            </select>
          </label>
          <div className="filter-actions">
            <button type="submit">检索</button>
            <a href="/memories">重置</a>
          </div>
        </form>

        <section className="panel">
          <div className="section-heading">
            <h2>{result.items.length} 条记忆</h2>
            <span className="muted-label">最多显示 100 条</span>
          </div>
          {result.items.length === 0 ? (
            <EmptyState title="没有匹配结果" detail="换一个关键词、标签或项目试试；也可以回到首页重新采集。" />
          ) : (
            <ol className="memory-list">
              {result.items.map((item) => (
                <li key={item.id}>
                  <div>
                    <span>{item.source === "codex" ? "Codex" : "Claude"}</span>
                    <time>{new Date(item.occurredAt).toLocaleString("zh-CN")}</time>
                  </div>
                  <strong>{item.title}</strong>
                  {item.summary ? <p className="memory-summary">{item.summary}</p> : null}
                  {item.projectPath ? <p>{item.projectPath}</p> : null}
                  {item.tags.length > 0 ? (
                    <div className="tag-row">
                      {item.tags.map((tag) => (
                        <a key={tag} href={`/memories?tag=${encodeURIComponent(tag)}`}>
                          {tag}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
    </>
  );
}

import Link from "next/link";

const navItems = [
  { href: "/", label: "今日" },
  { href: "/actions", label: "行动" },
  { href: "/reviews", label: "复盘" },
  { href: "/memories", label: "记忆" },
  { href: "/memories/quality", label: "质量" },
  { href: "/projects", label: "项目" },
  { href: "/strategy", label: "战略" },
  { href: "/sync", label: "同步" },
  { href: "/goals", label: "目标" },
  { href: "/decisions", label: "决策" },
  { href: "/blockers", label: "阻塞" },
  { href: "/health", label: "环境" }
];

export function AppNav() {
  return (
    <nav className="app-nav" aria-label="主导航">
      <Link href="/" className="brand-mark">
        AI Memory
      </Link>
      <div>
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

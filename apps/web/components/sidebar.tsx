"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/overview", label: "Overview", icon: "📊" },
  { href: "/sources", label: "Sources", icon: "🔌" },
  { href: "/runs", label: "Runs", icon: "⚡" },
  { href: "/leads", label: "Leads", icon: "🎯" },
  { href: "/suppression", label: "Suppression", icon: "🛡️" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="w-60 shrink-0 h-screen border-r flex flex-col justify-between p-4 select-none z-30"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
    >
      <div className="space-y-6">
        <div className="px-3 pt-2">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#0f6e56]"></span>
            <span className="text-lg font-bold tracking-tight">Pyro</span>
            <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-[#e6f2ee] text-[#0f6e56]">v1.0</span>
          </div>
          <div className="text-xs mt-1 text-gray-400">PyrexxAI Lead Engine</div>
        </div>

        <nav className="space-y-1">
          {items.map((it) => {
            const active = pathname === it.href || (it.href !== "/overview" && pathname?.startsWith(it.href));
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? "bg-[#e6f2ee] text-[#0f6e56] font-semibold"
                    : "text-gray-600 hover:bg-gray-100/80 hover:text-gray-900"
                }`}
              >
                <span>{it.icon}</span>
                <span>{it.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="px-3 py-2 text-xs border-t text-gray-400" style={{ borderColor: "var(--border)" }}>
        <div>Neon Serverless DB</div>
        <div className="text-[11px] font-mono text-emerald-700 font-semibold">Active</div>
      </div>
    </aside>
  );
}
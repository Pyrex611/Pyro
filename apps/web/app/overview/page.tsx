export const dynamic = "force-dynamic";

import { getDbPool } from "@/lib/db";
import { isNeonConfigured } from "@/lib/config";
import Link from "next/link";

export default async function OverviewPage() {
  let totalLeads = 0;
  let qualifiedLeads = 0;
  let activeRuns = 0;

  if (isNeonConfigured()) {
    try {
      const pool = getDbPool();
      const leadCountRes = await pool.query(`SELECT COUNT(*) FROM leads`);
      totalLeads = Number(leadCountRes.rows[0]?.count ?? 0);

      const qualCountRes = await pool.query(`SELECT COUNT(*) FROM leads WHERE score >= 75`);
      qualifiedLeads = Number(qualCountRes.rows[0]?.count ?? 0);

      const runCountRes = await pool.query(`SELECT COUNT(*) FROM runs WHERE status IN ('queued', 'running')`);
      activeRuns = Number(runCountRes.rows[0]?.count ?? 0);
    } catch (e) {
      console.error("Overview query error:", e);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Healthcare lead pipeline intelligence & acquisition monitors.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>Total Leads Acquired</div>
          <div className="text-3xl font-bold mt-2">{totalLeads}</div>
        </div>
        <div className="card">
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>High-Intent Qualified</div>
          <div className="text-3xl font-bold mt-2" style={{ color: "var(--accent)" }}>{qualifiedLeads}</div>
        </div>
        <div className="card">
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>Active Scraper Runs</div>
          <div className="text-3xl font-bold mt-2">{activeRuns}</div>
        </div>
        <div className="card">
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>Database Engine</div>
          <div className="text-sm font-semibold mt-3 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
            Neon Serverless Postgres
          </div>
        </div>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Quick Actions</h2>
          <Link href="/leads" className="text-xs font-semibold underline" style={{ color: "var(--accent)" }}>
            Explore All Leads →
          </Link>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/leads" className="btn-primary">
            Open Lead Explorer
          </Link>
          <button className="btn-outline" disabled>
            Launch GMaps Scrape (Phase 2)
          </button>
        </div>
      </div>
    </div>
  );
}
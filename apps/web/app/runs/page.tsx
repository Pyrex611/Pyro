"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RunsPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openKebabId, setOpenKebabId] = useState<string | null>(null);

  useEffect(() => {
    loadRuns();
  }, []);

  async function loadRuns() {
    setLoading(true);
    try {
      const res = await fetch("/api/runs");
      const data = await res.json();
      setRuns(data.runs || []);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteRun(runId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this run record?")) return;
    await fetch(`/api/runs/${runId}`, { method: "DELETE" });
    setOpenKebabId(null);
    loadRuns();
  }

  function handleChaining(run: any, e: React.MouseEvent) {
    e.stopPropagation();
    router.push(`/runs/${run.id}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Execution Runs</h1>
          <p className="text-sm text-gray-500">
            Historical scraper jobs, record counts, and workflow chaining triggers.
          </p>
        </div>
      </div>

      <div className="card overflow-hidden p-0 relative" onClick={() => setOpenKebabId(null)}>
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b bg-[#f7f7f5] text-xs font-semibold text-gray-600" style={{ borderColor: "var(--border)" }}>
              <th className="py-3 px-4">Run ID</th>
              <th className="py-3 px-4">Source / Tool</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Raw Found</th>
              <th className="py-3 px-4">Deduped Leads</th>
              <th className="py-3 px-4">Date</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400">Loading runs...</td></tr>
            ) : runs.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400">No runs recorded yet.</td></tr>
            ) : (
              runs.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/runs/${r.id}`)}
                  className="border-b transition-colors cursor-pointer hover:bg-gray-50/50"
                  style={{ borderColor: "var(--border)" }}
                >
                  <td className="py-3 px-4 font-mono text-xs font-semibold text-[#0f6e56]">
                    {r.id.slice(0, 8)}...
                  </td>
                  <td className="py-3 px-4 font-medium">{r.source_id}</td>
                  <td className="py-3 px-4">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                      r.status === "succeeded" ? "bg-[#e6f2ee] text-[#0f6e56]" : "bg-blue-50 text-blue-700"
                    }`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="py-3 px-4">{r.records_raw}</td>
                  <td className="py-3 px-4 font-bold text-emerald-800">{r.records_deduped}</td>
                  <td className="py-3 px-4 text-xs text-gray-400">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right relative" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setOpenKebabId(openKebabId === r.id ? null : r.id)}
                      className="p-1 rounded hover:bg-gray-100 text-gray-500 font-bold px-2"
                    >
                      •••
                    </button>

                    {/* Kebab Action Menu */}
                    {openKebabId === r.id && (
                      <div className="absolute right-4 mt-1 w-44 bg-white border rounded-lg shadow-xl py-1 z-30 text-xs text-left" style={{ borderColor: "var(--border)" }}>
                        <Link href={`/runs/${r.id}`} className="block px-3 py-1.5 hover:bg-gray-100 font-medium">
                          Inspect Run & Leads
                        </Link>
                        <a href={`/api/runs/${r.id}/records?format=csv`} className="block px-3 py-1.5 hover:bg-gray-100">
                          Download Raw CSV
                        </a>
                        <button
                          onClick={(e) => handleChaining(r, e)}
                          className="w-full text-left px-3 py-1.5 hover:bg-gray-100 text-[#0f6e56] font-medium"
                        >
                          ⚡ Feed to MoltSets
                        </button>
                        <div className="border-t my-1"></div>
                        <button
                          onClick={(e) => handleDeleteRun(r.id, e)}
                          className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-600 font-medium"
                        >
                          Delete Run
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
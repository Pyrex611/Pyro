"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DynamicIsland } from "@/components/dynamic-island";
import { toCsvString } from "@/lib/csv";

interface PageProps {
  params: { id: string };
}

export default function RunDetailPage({ params }: PageProps) {
  const { id } = params;
  const router = useRouter();
  const [run, setRun] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [view, setView] = useState<"companies" | "personnel">("companies");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  // Selection & Bulk Action State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  async function loadData() {
    try {
      const runRes = await fetch(`/api/runs/${id}`);
      const runData = await runRes.json();
      setRun(runData.run);

      // Fetch scoped leads for this specific run
      const leadsRes = await fetch(`/api/leads?runId=${id}&view=${view}&pageSize=100`);
      const leadsData = await leadsRes.json();
      setItems(leadsData.items ?? []);
      setSelectedIds(new Set());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [id, view]);

  useEffect(() => {
    if (run?.status === "running" || run?.status === "queued") {
      const interval = setInterval(loadData, 3000);
      return () => clearInterval(interval);
    }
  }, [id, run?.status, view]);

  function toggleSelectAll() {
    if (selectedIds.size === items.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map((i) => i.id)));
  }

  function toggleRow(rowId: string, e: React.MouseEvent) {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(rowId)) next.delete(rowId);
    else next.add(rowId);
    setSelectedIds(next);
  }

  async function handleDeleteSelected() {
    const count = selectedIds.size;
    if (!count) return;
    if (!confirm(`Permanently delete ${count} selected ${view} from this run? This cannot be undone.`)) return;

    setDeleting(true);
    try {
      const res = await fetch("/api/leads", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), view }),
      });
      if (res.ok) {
        setSelectedIds(new Set());
        loadData();
      }
    } finally {
      setDeleting(false);
    }
  }

  function handleFeedToMoltsets() {
    // If specific leads are selected, only feed those; otherwise feed all non-empty domains from the run
    const targetItems = selectedIds.size > 0 ? items.filter((i) => selectedIds.has(i.id)) : items;

    const domains = targetItems
      .map((l) => l.domain || l.company_domain)
      .filter(Boolean)
      .slice(0, 100);

    if (!domains.length) {
      alert("No website domains available to feed into MoltSets.");
      return;
    }

    const domainString = domains.join(",");
    router.push(`/sources/moltsets?tool=batch_domains&domains=${encodeURIComponent(domainString)}`);
  }

  async function exportSelectedCsv() {
    const toExport = selectedIds.size > 0 ? items.filter((i) => selectedIds.has(i.id)) : items;
    if (!toExport.length) return;

    const csv = toCsvString(toExport);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pyro_run_${id.slice(0, 8)}_${view}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const res = await fetch(`/api/runs/${id}/refresh`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setRefreshMsg(data.message || "Successfully refreshed leads!");
        await loadData();
      } else {
        alert(data.error || "Failed to re-parse leads");
      }
    } finally {
      setRefreshing(false);
    }
  }

  if (loading && !run) {
    return <div className="text-sm p-8 text-gray-400">Loading run details...</div>;
  }

  if (!run) {
    return (
      <div className="card space-y-2">
        <h2 className="text-lg font-bold text-red-600">Run Not Found</h2>
        <Link href="/runs" className="text-sm underline text-[#0f6e56]">← Back to Runs</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header with Back Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/runs" className="btn-outline text-xs py-1.5 px-3">
            ← Back to Runs
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">Run {run.id.slice(0, 8)}</h1>
              <span className="badge-teal capitalize font-semibold">{run.status}</span>
            </div>
            <p className="text-xs font-mono mt-0.5 text-gray-400">Source: {run.source_id}</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="btn-outline text-xs flex items-center gap-1.5"
            title="Re-evaluates saved raw records using latest mappers and scoring engine"
          >
            <span>↻</span> {refreshing ? "Re-parsing..." : "Re-parse & Refresh"}
          </button>

          {items.length > 0 && (
            <button onClick={handleFeedToMoltsets} className="btn-primary text-xs flex items-center gap-1.5">
              <span>⚡</span> Feed to MoltSets
            </button>
          )}

          <a href={`/api/runs/${run.id}/records?format=csv`} className="btn-outline text-xs">
            Export CSV
          </a>
        </div>
      </div>

      {refreshMsg && (
        <div className="p-3 rounded-md bg-[#e6f2ee] border border-[#0f6e56]/30 text-xs text-[#0f6e56] font-medium">
          ✓ {refreshMsg}
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card text-center">
          <div className="text-xs text-gray-400">Raw Items Scraped</div>
          <div className="text-2xl font-bold mt-1">{run.records_raw}</div>
        </div>
        <div className="card text-center">
          <div className="text-xs text-gray-400">Canonical Leads Deduped</div>
          <div className="text-2xl font-bold mt-1 text-emerald-800">{run.records_deduped}</div>
        </div>
        <div className="card text-center">
          <div className="text-xs text-gray-400">Started At</div>
          <div className="text-xs font-mono mt-2">{run.started_at ? new Date(run.started_at).toLocaleTimeString() : "—"}</div>
        </div>
        <div className="card text-center">
          <div className="text-xs text-gray-400">Finished At</div>
          <div className="text-xs font-mono mt-2">{run.finished_at ? new Date(run.finished_at).toLocaleTimeString() : "—"}</div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* CENTRALIZED DYNAMIC ISLAND (DIRECTLY ABOVE RUN LEADS TABLE)       */}
      {/* ================================================================= */}
      <DynamicIsland
        view={view}
        onViewChange={(v) => setView(v)}
        companiesCount={view === "companies" ? items.length : undefined}
        personnelCount={view === "personnel" ? items.length : undefined}
      />

      {/* Scoped Leads Table for this Specific Run with Checkboxes */}
      <div className="card overflow-hidden p-0 shadow-sm relative">
        <div className="p-4 border-b flex justify-between items-center bg-[#f7f7f5]" style={{ borderColor: "var(--border)" }}>
          <span className="font-semibold text-sm">
            {view === "companies" ? "Practices Discovered in this Run" : "Personnel Discovered in this Run"} ({items.length})
          </span>
          <span className="text-xs text-[#0f6e56] font-medium">Attributed to Run {run.id.slice(0, 8)}</span>
        </div>

        {view === "companies" ? (
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b text-xs text-gray-600 bg-white" style={{ borderColor: "var(--border)" }}>
                <th className="py-2.5 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={items.length > 0 && selectedIds.size === items.length}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 cursor-pointer"
                  />
                </th>
                <th className="py-2.5 px-4 font-semibold">Practice Name</th>
                <th className="py-2.5 px-4 font-semibold">Fit Score</th>
                <th className="py-2.5 px-4 font-semibold">General Phone</th>
                <th className="py-2.5 px-4 font-semibold">Domain</th>
                <th className="py-2.5 px-4 font-semibold">Decision Maker</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-xs text-gray-400">No practices attributed to this run yet.</td></tr>
              ) : (
                items.map((lead) => {
                  const isSelected = selectedIds.has(lead.id);
                  return (
                    <tr key={lead.id} className={`border-b transition-colors cursor-pointer ${isSelected ? "bg-[#e6f2ee]/60" : "hover:bg-gray-50/50"}`}>
                      <td className="py-2.5 px-4" onClick={(e) => toggleRow(lead.id, e)}>
                        <input type="checkbox" checked={isSelected} onChange={() => {}} className="rounded cursor-pointer" />
                      </td>
                      <td className="py-2.5 px-4 font-medium">{lead.name}</td>
                      <td className="py-2.5 px-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          lead.score >= 75 ? "bg-[#e6f2ee] text-[#0f6e56]" : "bg-gray-100 text-gray-500"
                        }`}>
                          {lead.score}/100
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-xs">{lead.phone_e164 || "—"}</td>
                      <td className="py-2.5 px-4 text-xs font-mono">{lead.domain || "—"}</td>
                      <td className="py-2.5 px-4 text-xs">
                        {lead.decision_maker?.name ? (
                          <div>
                            <div className="font-medium">{lead.decision_maker.name}</div>
                            <div className="text-gray-400">{lead.decision_maker.title}</div>
                          </div>
                        ) : lead.decision_maker?.title ? (
                          <span className="text-gray-700 font-medium">{lead.decision_maker.title}</span>
                        ) : (
                          <span className="text-gray-400">Unresolved</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b text-xs text-gray-600 bg-white" style={{ borderColor: "var(--border)" }}>
                <th className="py-2.5 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={items.length > 0 && selectedIds.size === items.length}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 cursor-pointer"
                  />
                </th>
                <th className="py-2.5 px-4 font-semibold">Individual Name</th>
                <th className="py-2.5 px-4 font-semibold">Title</th>
                <th className="py-2.5 px-4 font-semibold">Direct Email</th>
                <th className="py-2.5 px-4 font-semibold">Direct Phone</th>
                <th className="py-2.5 px-4 font-semibold">Practice Affiliation</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-xs text-gray-400">No personnel attributed to this run yet.</td></tr>
              ) : (
                items.map((p) => {
                  const isSelected = selectedIds.has(p.id);
                  return (
                    <tr key={p.id} className={`border-b transition-colors cursor-pointer ${isSelected ? "bg-[#e6f2ee]/60" : "hover:bg-gray-50/50"}`}>
                      <td className="py-2.5 px-4" onClick={(e) => toggleRow(p.id, e)}>
                        <input type="checkbox" checked={isSelected} onChange={() => {}} className="rounded cursor-pointer" />
                      </td>
                      <td className="py-2.5 px-4 font-medium">{p.full_name}</td>
                      <td className="py-2.5 px-4 text-xs font-medium text-gray-700">{p.title || "—"}</td>
                      <td className="py-2.5 px-4 text-xs font-mono text-emerald-800">{p.direct_email || "—"}</td>
                      <td className="py-2.5 px-4 text-xs font-mono">{p.direct_phone || "—"}</td>
                      <td className="py-2.5 px-4 text-xs font-medium text-gray-800">{p.company_name || p.company_domain || "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Floating Bulk Action Bar for this Run */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white border border-[#0f6e56] rounded-xl shadow-2xl px-6 py-3 flex items-center gap-4">
          <div className="text-xs font-semibold text-[#0f6e56]">
            {selectedIds.size} {view} selected
          </div>
          <div className="h-4 w-px bg-gray-200"></div>
          <button onClick={exportSelectedCsv} className="btn-primary text-xs py-1.5 px-3">
            Download CSV ({selectedIds.size})
          </button>
          {view === "companies" && (
            <button onClick={handleFeedToMoltsets} className="btn-outline text-xs text-[#0f6e56] py-1.5 px-3">
              ⚡ Feed Selected to MoltSets
            </button>
          )}
          <button
            onClick={handleDeleteSelected}
            disabled={deleting}
            className="btn-outline text-xs text-red-600 border-red-300 hover:bg-red-50 py-1.5 px-3 font-semibold"
          >
            {deleting ? "Deleting..." : `Delete Selected (${selectedIds.size})`}
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-xs text-gray-400 hover:text-gray-600">
            Deselect
          </button>
        </div>
      )}
    </div>
  );
}
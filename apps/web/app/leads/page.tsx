"use client";

import { useEffect, useState } from "react";
import { toCsvString } from "@/lib/csv";
import { DynamicIsland } from "@/components/dynamic-island";

export default function LeadsPage() {
  const [view, setView] = useState<"companies" | "personnel">("companies");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [companyPersonnel, setCompanyPersonnel] = useState<any[]>([]);

  // Pagination State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadData();
  }, [view, page, pageSize]);

  async function loadData() {
    setLoading(true);
    try {
      const p = new URLSearchParams({
        view,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) p.set("search", search);

      const res = await fetch(`/api/leads?${p.toString()}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setTotal(data.pagination?.total ?? 0);
      setTotalPages(data.pagination?.totalPages ?? 1);
    } finally {
      setLoading(false);
    }
  }

  // Fetch attached personnel when a company is selected for drawer view
  useEffect(() => {
    if (selectedItem && view === "companies") {
      fetch(`/api/leads?view=personnel&search=${encodeURIComponent(selectedItem.name)}`)
        .then((res) => res.json())
        .then((d) => setCompanyPersonnel(d.items || []))
        .catch(() => setCompanyPersonnel([]));
    } else {
      setCompanyPersonnel([]);
    }
  }, [selectedItem, view]);

  function handleViewToggle(newView: "companies" | "personnel") {
    if (newView === view) return;
    setView(newView);
    setPage(1);
    setSelectedIds(new Set());
    setSelectedItem(null);
  }

  function toggleSelectAll() {
    if (selectedIds.size === items.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map((i) => i.id)));
  }

  function toggleRow(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  async function handleDeleteSelected() {
    const count = selectedIds.size;
    if (!count) return;
    if (!confirm(`Permanently delete ${count} selected ${view}? This cannot be undone.`)) return;

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

  async function exportSelectedCsv() {
    const toExport = items.filter((i) => selectedIds.has(i.id));
    if (!toExport.length) return;

    const csv = toCsvString(toExport);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pyro_${view}_p${page}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const startRecord = (page - 1) * pageSize + 1;
  const endRecord = Math.min(page * pageSize, total);

  return (
    <div className="space-y-4">
      {/* Title Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Leads Explorer</h1>
        <p className="text-sm text-gray-500">
          Canonical accounts and personnel records resolved across all scraper runs.
        </p>
      </div>

      {/* Filter & Search Ribbon */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder={view === "companies" ? "Search clinic name, city, domain..." : "Search doctor name, title, email..."}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && loadData()}
          className="border rounded-md px-3 py-2 text-sm w-72 bg-white"
          style={{ borderColor: "var(--border)" }}
        />
        <button onClick={loadData} className="btn-outline text-xs py-2 px-3">Search</button>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-400">Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="border rounded-md px-2 py-1 text-xs bg-white"
            style={{ borderColor: "var(--border)" }}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      {/* ================================================================= */}
      {/* CENTRALIZED DYNAMIC ISLAND MENU HEADER (DIRECTLY ABOVE TABLE)     */}
      {/* ================================================================= */}
      <DynamicIsland
        view={view}
        onViewChange={handleViewToggle}
        companiesCount={view === "companies" ? total : undefined}
        personnelCount={view === "personnel" ? total : undefined}
      />

      {/* ================================================================= */}
      {/* 1. PRACTICES / CLINICS TABLE                                      */}
      {/* ================================================================= */}
      {view === "companies" && (
        <div className="card overflow-hidden p-0 relative shadow-sm">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b bg-[#f7f7f5] text-xs font-semibold text-gray-600" style={{ borderColor: "var(--border)" }}>
                <th className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={items.length > 0 && selectedIds.size === items.length}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-4">Practice / Clinic</th>
                <th className="py-3 px-4">Fit Score</th>
                <th className="py-3 px-4">General Phone</th>
                <th className="py-3 px-4">Domain</th>
                <th className="py-3 px-4">Primary Decision Maker</th>
                <th className="py-3 px-4">Personnel</th>
                <th className="py-3 px-4">Location</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-10 text-gray-400">Loading practices from database...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-gray-400">No practices found.</td></tr>
              ) : (
                items.map((c) => {
                  const isSelected = selectedIds.has(c.id);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedItem(c)}
                      className={`border-b transition-colors cursor-pointer ${
                        isSelected ? "bg-[#e6f2ee]/60" : "hover:bg-[#e6f2ee]/30"
                      }`}
                      style={{ borderColor: "var(--border)" }}
                    >
                      <td className="py-3 px-4" onClick={(e) => toggleRow(c.id, e)}>
                        <input type="checkbox" checked={isSelected} onChange={() => {}} className="rounded cursor-pointer" />
                      </td>
                      <td className="py-3 px-4 font-medium">{c.name}</td>
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          c.score >= 75 ? "bg-[#e6f2ee] text-[#0f6e56]" : c.score >= 40 ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-500"
                        }`}>
                          {c.score}/100
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs">{c.phone_e164 || "—"}</td>
                      <td className="py-3 px-4">
                        {c.website ? (
                          <a href={c.website} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs underline text-[#0f6e56]">
                            {c.domain || "Visit"}
                          </a>
                        ) : (
                          <span className="text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded">No Website</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {c.decision_maker?.name ? (
                          <div>
                            <div className="font-medium text-gray-900">{c.decision_maker.name}</div>
                            <div className="text-gray-400">{c.decision_maker.title || "Decision Maker"}</div>
                          </div>
                        ) : c.decision_maker?.title ? (
                          <div>
                            <div className="font-medium text-gray-700">{c.decision_maker.title}</div>
                            <div className="text-gray-400 text-[10px]">Title on record</div>
                          </div>
                        ) : (
                          <span className="text-gray-400">Unresolved</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <span className="px-2 py-0.5 rounded bg-gray-100 font-semibold text-gray-700">
                          {c.staff_count ?? 0} staff
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-500">
                        {c.city && c.state ? `${c.city}, ${c.state}` : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ================================================================= */}
      {/* 2. PERSONNEL / DOCTORS TABLE                                      */}
      {/* ================================================================= */}
      {view === "personnel" && (
        <div className="card overflow-hidden p-0 relative shadow-sm">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b bg-[#f7f7f5] text-xs font-semibold text-gray-600" style={{ borderColor: "var(--border)" }}>
                <th className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={items.length > 0 && selectedIds.size === items.length}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-4">Doctor / Individual</th>
                <th className="py-3 px-4">Title & Role</th>
                <th className="py-3 px-4">Direct Email</th>
                <th className="py-3 px-4">Direct Phone</th>
                <th className="py-3 px-4">Practice Affiliation</th>
                <th className="py-3 px-4">LinkedIn</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400">Loading personnel roster...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400">No personnel records found yet.</td></tr>
              ) : (
                items.map((p) => {
                  const isSelected = selectedIds.has(p.id);
                  return (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedItem(p)}
                      className={`border-b transition-colors cursor-pointer ${
                        isSelected ? "bg-[#e6f2ee]/60" : "hover:bg-[#e6f2ee]/30"
                      }`}
                      style={{ borderColor: "var(--border)" }}
                    >
                      <td className="py-3 px-4" onClick={(e) => toggleRow(p.id, e)}>
                        <input type="checkbox" checked={isSelected} onChange={() => {}} className="rounded cursor-pointer" />
                      </td>
                      <td className="py-3 px-4 font-medium flex items-center gap-1.5">
                        <span>{p.full_name}</span>
                        {p.is_primary_decision_maker && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-bold">Owner</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs font-medium text-gray-700">{p.title || "—"}</td>
                      <td className="py-3 px-4 text-xs font-mono">
                        {p.direct_email ? (
                          <span className="flex items-center gap-1.5 text-emerald-800">
                            {p.direct_email}
                            {p.email_risk_score && (
                              <span className="text-[9px] bg-emerald-100 px-1 py-0.2 rounded font-bold">{p.email_risk_score}</span>
                            )}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs">{p.direct_phone || "—"}</td>
                      <td className="py-3 px-4 text-xs text-gray-800 font-medium">{p.company_name || p.company_domain || "—"}</td>
                      <td className="py-3 px-4 text-xs">
                        {p.linkedin_url ? (
                          <a href={p.linkedin_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-[#0f6e56] underline font-semibold">
                            Profile ↗
                          </a>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Bar */}
      <div className="p-4 border-t flex flex-wrap items-center justify-between bg-[#f7f7f5] text-xs text-gray-600 rounded-lg">
        <div>Showing <b>{total > 0 ? startRecord : 0}</b> to <b>{endRecord}</b> of <b>{total}</b> total {view}</div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage((p) => Math.max(p - 1, 1))} disabled={page <= 1 || loading} className="btn-outline text-xs px-3 py-1 disabled:opacity-40">← Previous</button>
          <span className="font-medium px-2">Page {page} of {totalPages || 1}</span>
          <button onClick={() => setPage((p) => Math.min(p + 1, totalPages))} disabled={page >= totalPages || loading} className="btn-outline text-xs px-3 py-1 disabled:opacity-40">Next →</button>
        </div>
      </div>

      {/* Floating Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white border border-[#0f6e56] rounded-xl shadow-2xl px-6 py-3 flex items-center gap-4">
          <div className="text-xs font-semibold text-[#0f6e56]">{selectedIds.size} {view} selected</div>
          <div className="h-4 w-px bg-gray-200"></div>
          <button onClick={exportSelectedCsv} className="btn-primary text-xs py-1.5 px-3">Download CSV ({selectedIds.size})</button>
          <button onClick={handleDeleteSelected} disabled={deleting} className="btn-outline text-xs text-red-600 border-red-300 hover:bg-red-50 py-1.5 px-3 font-semibold">
            {deleting ? "Deleting..." : `Delete Selected (${selectedIds.size})`}
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-xs text-gray-400 hover:text-gray-600">Deselect</button>
        </div>
      )}

      {/* Contextual Detail Drawer */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm" onClick={() => setSelectedItem(null)}>
          <div
            className="w-full max-w-lg bg-white h-full shadow-2xl p-6 overflow-y-auto space-y-6"
            onClick={(e) => e.stopPropagation()}
            style={{ borderLeft: "1px solid var(--border)" }}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold">{selectedItem.name || selectedItem.full_name}</h2>
                <div className="text-xs text-gray-400">ID: {selectedItem.id}</div>
              </div>
              <button onClick={() => setSelectedItem(null)} className="text-sm font-semibold p-1 hover:bg-gray-100 rounded text-gray-400">✕</button>
            </div>

            {/* Practice Details Drawer */}
            {view === "companies" && (
              <>
                <div className="card space-y-3 bg-[#e6f2ee]/40 border-[#0f6e56]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#0f6e56]">Commercial Fit Score</span>
                    <span className="text-xl font-bold text-[#0f6e56]">{selectedItem.score}/100</span>
                  </div>
                  <ul className="text-xs space-y-1">
                    {selectedItem.score_reasons?.map((reason: string, idx: number) => (
                      <li key={idx} className="flex items-center gap-1.5 text-gray-800"><span>•</span> {reason}</li>
                    ))}
                  </ul>
                </div>

                {/* Attached Personnel Roster */}
                <div className="card space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Practice Personnel Roster ({companyPersonnel.length})</h3>
                    <span className="text-[11px] text-[#0f6e56] font-medium">Verified Staff</span>
                  </div>
                  {companyPersonnel.length === 0 ? (
                    <p className="text-xs text-gray-400">No staff attached to this clinic yet. Run MoltSets to enrich.</p>
                  ) : (
                    <div className="divide-y text-xs">
                      {companyPersonnel.map((staff) => (
                        <div key={staff.id} className="py-2 space-y-0.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-gray-900">{staff.full_name}</span>
                            <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">{staff.title || "Staff"}</span>
                          </div>
                          {staff.direct_email && <div className="text-emerald-800 font-mono text-[11px]">{staff.direct_email}</div>}
                          {staff.direct_phone && <div className="text-gray-500 font-mono text-[11px]">{staff.direct_phone}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="card space-y-2">
                  <h3 className="text-sm font-semibold">Clinic Contact Channels</h3>
                  <div className="divide-y text-xs">
                    <div className="py-1.5 flex justify-between"><span className="text-gray-400">Website:</span><span className="font-medium">{selectedItem.website || "—"}</span></div>
                    <div className="py-1.5 flex justify-between"><span className="text-gray-400">General Phone:</span><span className="font-medium font-mono">{selectedItem.phone_e164 || "—"}</span></div>
                    <div className="py-1.5 flex justify-between"><span className="text-gray-400">Location:</span><span className="font-medium">{selectedItem.city ? `${selectedItem.city}, ${selectedItem.state}` : "—"}</span></div>
                  </div>
                </div>
              </>
            )}

            {/* Personnel Details Drawer */}
            {view === "personnel" && (
              <>
                <div className="card space-y-3 bg-[#e6f2ee]/40 border-[#0f6e56]">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#0f6e56]">Contact Dossier</div>
                  <div className="text-sm">
                    <div className="font-bold text-base">{selectedItem.full_name}</div>
                    <div className="text-gray-600 text-xs">{selectedItem.title}</div>
                  </div>
                </div>

                <div className="card space-y-2">
                  <h3 className="text-sm font-semibold">Direct Channels</h3>
                  <div className="divide-y text-xs">
                    <div className="py-1.5 flex justify-between"><span className="text-gray-400">Direct Email:</span><span className="font-mono font-medium text-emerald-800">{selectedItem.direct_email || "—"}</span></div>
                    <div className="py-1.5 flex justify-between"><span className="text-gray-400">Deliverability:</span><span className="font-bold text-emerald-800">{selectedItem.email_risk_score || "Unverified"}</span></div>
                    <div className="py-1.5 flex justify-between"><span className="text-gray-400">Direct Cell:</span><span className="font-mono font-medium">{selectedItem.direct_phone || "—"}</span></div>
                  </div>
                </div>

                <div className="card space-y-2">
                  <h3 className="text-sm font-semibold">Practice Affiliation</h3>
                  <div className="text-xs space-y-1">
                    <div className="font-medium text-sm">{selectedItem.company_name}</div>
                    <div className="text-gray-500 font-mono">{selectedItem.company_domain}</div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
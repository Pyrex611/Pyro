"use client";

import { useEffect, useState, useMemo } from "react";

interface SuppressionItem {
  id: string;
  kind: "domain" | "email" | "phone";
  value: string;
  reason?: string;
  created_at: string;
}

export default function SuppressionPage() {
  const [items, setItems] = useState<SuppressionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterKind, setFilterKind] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [newKind, setNewKind] = useState<"domain" | "email" | "phone">("domain");
  const [newValue, setNewValue] = useState("");
  const [newReason, setNewReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadSuppression();
  }, [filterKind]);

  async function loadSuppression() {
    setLoading(true);
    try {
      const url = filterKind === "all" ? "/api/suppression" : `/api/suppression?kind=${filterKind}`;
      const res = await fetch(url);
      const data = await res.json();
      setItems(data.items || []);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newValue.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/suppression", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: newKind, value: newValue, reason: newReason }),
      });
      if (res.ok) {
        setNewValue("");
        setNewReason("");
        setShowModal(false);
        loadSuppression();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to remove this item from suppression?")) return;
    await fetch(`/api/suppression?id=${id}`, { method: "DELETE" });
    loadSuppression();
  }

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return item.value.toLowerCase().includes(q) || (item.reason && item.reason.toLowerCase().includes(q));
    });
  }, [items, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Compliance & Suppression</h1>
          <p className="text-sm text-gray-500">
            Global blacklist: Suppressed domains, emails, and phones are excluded from MoltSets and export pipelines.
          </p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary text-xs">
          + Add Suppression Entry
        </button>
      </div>

      {/* Filter Ribbon */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search domain, email, reason..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm w-72 bg-white"
          style={{ borderColor: "var(--border)" }}
        />
        <div className="flex rounded-md border bg-white p-0.5 text-xs font-medium" style={{ borderColor: "var(--border)" }}>
          {["all", "domain", "email", "phone"].map((k) => (
            <button
              key={k}
              onClick={() => setFilterKind(k)}
              className={`px-3 py-1.5 rounded capitalize ${
                filterKind === k ? "bg-[#e6f2ee] text-[#0f6e56] font-semibold" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {k === "all" ? "All Entries" : `${k}s`}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-gray-400">Total: {filtered.length} entries</span>
      </div>

      {/* Suppression Data Table */}
      <div className="card overflow-hidden p-0">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b bg-[#f7f7f5] text-xs font-semibold text-gray-600" style={{ borderColor: "var(--border)" }}>
              <th className="py-3 px-4">Kind</th>
              <th className="py-3 px-4">Blacklisted Value</th>
              <th className="py-3 px-4">Reason / Notes</th>
              <th className="py-3 px-4">Added Date</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">Loading suppression list...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">No suppression records found.</td></tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.id} className="border-b transition-colors hover:bg-gray-50/50" style={{ borderColor: "var(--border)" }}>
                  <td className="py-3 px-4">
                    <span className="text-[11px] px-2 py-0.5 rounded font-mono font-medium uppercase bg-gray-100 text-gray-700">
                      {item.kind}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs font-medium text-gray-800">{item.value}</td>
                  <td className="py-3 px-4 text-xs text-gray-600">{item.reason || "—"}</td>
                  <td className="py-3 px-4 text-xs text-gray-400">{new Date(item.created_at).toLocaleDateString()}</td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-xs text-red-600 hover:text-red-800 font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-base">Add Suppression Entry</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1 text-gray-700">Type</label>
                <select
                  value={newKind}
                  onChange={(e: any) => setNewKind(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                  style={{ borderColor: "var(--border)" }}
                >
                  <option value="domain">Company Domain (e.g. acme.com)</option>
                  <option value="email">Email Address (e.g. optout@example.com)</option>
                  <option value="phone">Phone Number (E.164 or local)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-gray-700">Value</label>
                <input
                  type="text"
                  placeholder={newKind === "domain" ? "acme.com" : newKind === "email" ? "doctor@clinic.com" : "+16145550100"}
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  required
                  className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                  style={{ borderColor: "var(--border)" }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-gray-700">Reason / Reference</label>
                <input
                  type="text"
                  placeholder="Existing Customer / Do Not Contact"
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                  style={{ borderColor: "var(--border)" }}
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-outline text-xs">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary text-xs">
                  {submitting ? "Saving..." : "Add Entry"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
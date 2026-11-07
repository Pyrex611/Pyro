"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

export type FieldType = "text" | "number" | "select";

export interface FieldDefinition {
  name: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  default: unknown;
  options?: { label: string; value: string }[];
  helperText?: string;
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  fields: FieldDefinition[];
}

export interface ProviderDefinition {
  id: string;
  name: string;
  badge: string;
  description: string;
  missingConfigNotice?: string;
  tools: ToolDefinition[];
}

const REGISTRY: Record<string, ProviderDefinition> = {
  apify: {
    id: "apify",
    name: "Apify Scraping Hub",
    badge: "Cloud Actor Container",
    description: "Managed serverless actors: Facebook Ad Library, LinkedIn Jobs, B2B Lead Enricher, and Google Search.",
    missingConfigNotice: "APIFY_TOKEN is missing. Please add it to your environment variables.",
    tools: [
      {
        id: "facebook-ads",
        name: "Facebook Ads Library Scraper",
        description: "Scrapes active commercial ad campaigns, creatives, impressions, and advertiser links by keyword or page URL.",
        fields: [
          {
            name: "query",
            label: "Search Phrase or Facebook Page URL",
            type: "text",
            placeholder: "MedSpa in Ohio OR https://www.facebook.com/ZapierApp",
            default: "MedSpa in Ohio",
            helperText: "Keywords automatically build the official Ad Library URL; direct page URLs scrape all page ads.",
          },
          {
            name: "country",
            label: "Target Country Code",
            type: "select",
            default: "ALL",
            options: [
              { label: "All Countries (Global)", value: "ALL" },
              { label: "United States (US)", value: "US" },
              { label: "Canada (CA)", value: "CA" },
              { label: "United Kingdom (GB)", value: "GB" },
            ],
          },
          { name: "count", label: "Max Ads to Scrape", type: "number", default: 20 },
        ],
      },
      {
        id: "linkedin-jobs",
        name: "LinkedIn Jobs Hiring Scraper",
        description: "Extracts practices hiring for key roles (Medical Director, Nurse Practitioner) with recruiter contacts and salaries.",
        fields: [
          { name: "keywords", label: "Job Title or Role", type: "text", placeholder: "Medical Director, Esthetician", default: "Medical Director" },
          { name: "location", label: "Target Location", type: "text", placeholder: "Columbus, OH or New York, NY", default: "Columbus, OH" },
          {
            name: "datePosted",
            label: "Posting Age",
            type: "select",
            default: "r604800",
            options: [
              { label: "Past 24 Hours", value: "r86400" },
              { label: "Past Week", value: "r604800" },
              { label: "Past Month", value: "r2592000" },
            ],
          },
          { name: "limit", label: "Max Jobs to Scrape", type: "number", default: 20 },
        ],
      },
      {
        id: "google-search",
        name: "Google Search Results Scraper",
        description: "Extracts organic search results and filters out national directories (Expedia, TripAdvisor) to capture independent practices.",
        fields: [
          {
            name: "queries",
            label: "Google Search Queries",
            type: "text",
            placeholder: "Hotels in Seattle OR MedSpas in Columbus OH",
            default: "Hotels in Seattle",
            helperText: "Accepts multiple search queries. Automatically filters aggregator sites like Expedia and Kayak.",
          },
          {
            name: "countryCode",
            label: "Country Code",
            type: "select",
            default: "us",
            options: [
              { label: "United States (us)", value: "us" },
              { label: "Canada (ca)", value: "ca" },
              { label: "United Kingdom (uk)", value: "uk" },
            ],
          },
          { name: "maxPagesPerQuery", label: "Max Pages per Query", type: "number", default: 1 },
        ],
      },
      {
        id: "gmaps",
        name: "Google Maps Scraper (Places)",
        description: "Extracts local businesses, addresses, ratings, review counts, coordinates, and phone numbers from Google Maps.",
        fields: [
          { name: "city", label: "Target City & State", type: "text", placeholder: "Columbus, OH", default: "Columbus, OH" },
          { name: "keyword", label: "Healthcare Niche / Keyword", type: "text", placeholder: "med spa", default: "med spa" },
          { name: "maxResults", label: "Max Places to Crawl", type: "number", default: 20 },
        ],
      },
    ],
  },
  moltsets: {
    id: "moltsets",
    name: "MoltSets Contact API",
    badge: "B2B Identity Container",
    description: "B2B search & identity resolution: Decision-maker discovery, batch domain lookup, and deliverability-graded emails.",
    missingConfigNotice: "MOLTSETS_API_KEY is missing. Please add it to your environment variables.",
    tools: [
      {
        id: "search_people",
        name: "Decision-Maker & Doctor Search (search_people)",
        description: "Search clinic owners and directors across job titles and states with deliverability-graded emails.",
        fields: [
          { name: "title", label: "Job Title", type: "text", placeholder: "Medical Director, Owner, Physician", default: "Medical Director" },
          {
            name: "seniority_preset",
            label: "Seniority Filter",
            type: "select",
            default: "all_executives",
            options: [
              { label: "All Executives (Owner, C-Suite, VP, Partner, Director)", value: "all_executives" },
              { label: "Owners & Partners Only", value: "owners_only" },
              { label: "Any Seniority", value: "any" },
            ],
          },
          { name: "country", label: "Country", type: "text", placeholder: "United States", default: "United States" },
          { name: "state", label: "State (Optional)", type: "text", placeholder: "Ohio, Texas, California", default: "" },
          {
            name: "maxPerCompany",
            label: "Max Contacts Per Practice / Company",
            type: "select",
            default: "2",
            options: [
              { label: "Max 1 per company (Maximum diversity)", value: "1" },
              { label: "Max 2 per company (Recommended)", value: "2" },
              { label: "Max 3 per company", value: "3" },
              { label: "Unlimited per company", value: "99" },
            ],
            helperText: "Stops a single large practice from dominating your search results.",
          },
          {
            name: "limit",
            label: "Total Leads to Acquire (10 - 100)",
            type: "select",
            default: "20",
            options: [
              { label: "10 Leads", value: "10" },
              { label: "20 Leads", value: "20" },
              { label: "50 Leads (Multi-page crawl)", value: "50" },
              { label: "100 Leads (Deep crawl)", value: "100" },
            ],
            helperText: "Automatically pages through MoltSets offset index to retrieve your full target volume.",
          },
        ],
      },
      {
        id: "batch_domains",
        name: "Batch Decision-Makers Across Companies",
        description: "Paste up to 100 clinic domains. Fetches senior executives across all companies in a single request.",
        fields: [
          {
            name: "domains",
            label: "Company Domains (Comma or Line-Separated)",
            type: "text",
            placeholder: "glowaesthetics.com, buckeyeskin.com",
            default: "",
            helperText: "Paste up to 100 domains. Automatically excludes any domain in your suppression list.",
          },
          { name: "title", label: "Job Title Filter (Optional)", type: "text", placeholder: "Medical Director, Owner", default: "" },
          {
            name: "maxPerCompany",
            label: "Max Contacts Per Company",
            type: "select",
            default: "2",
            options: [
              { label: "Max 1 per company", value: "1" },
              { label: "Max 2 per company (Recommended)", value: "2" },
              { label: "Unlimited", value: "99" },
            ],
          },
          {
            name: "limit",
            label: "Total Target Leads",
            type: "select",
            default: "25",
            options: [
              { label: "25 Leads", value: "25" },
              { label: "50 Leads", value: "50" },
              { label: "100 Leads", value: "100" },
            ],
          },
        ],
      },
      {
        id: "linkedin_to_best_email",
        name: "LinkedIn to Best Business Email",
        description: "Resolves deliverability-graded business email (Grade A-D) from a direct LinkedIn profile URL.",
        fields: [
          { name: "linkedin_url", label: "LinkedIn Profile URL", type: "text", placeholder: "https://linkedin.com/in/username", default: "" },
        ],
      },
      {
        id: "linkedin_to_personal_email_usa",
        name: "LinkedIn to Personal Email (USA)",
        description: "Resolves verified US personal email (Gmail/Yahoo/iCloud) for individual physicians or clinic owners.",
        fields: [
          { name: "linkedin_url", label: "LinkedIn Profile URL", type: "text", placeholder: "https://linkedin.com/in/username", default: "" },
        ],
      },
    ],
  },
  mock: {
    id: "mock",
    name: "Synthetic Test Generator",
    badge: "Local Testing Tool",
    description: "Generates realistic, pre-scored healthcare leads for pipeline validation without using API credits.",
    tools: [
      {
        id: "synthetic-medspa",
        name: "Synthetic MedSpa Discovery",
        description: "Creates verified Columbus MedSpa leads with ratings, ad signals, and owner details.",
        fields: [{ name: "count", label: "Number of Leads", type: "number", default: 3 }],
      },
    ],
  },
};

export default function DynamicSourcePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const sourceId = Array.isArray(params?.sourceId) ? params.sourceId[0] : (params?.sourceId as string);

  const manifest = useMemo(() => {
    return sourceId ? REGISTRY[sourceId] : undefined;
  }, [sourceId]);

  const [serverConfigured, setServerConfigured] = useState<boolean | null>(null);
  const [activeToolId, setActiveToolId] = useState<string>("");
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<any>(null);
  const [sourceRuns, setSourceRuns] = useState<any[]>([]);

  // Check server configuration
  useEffect(() => {
    fetch("/api/providers")
      .then((res) => res.json())
      .then((data) => {
        if (sourceId && data?.providers?.[sourceId]) {
          setServerConfigured(Boolean(data.providers[sourceId].configured));
        } else {
          setServerConfigured(false);
        }
      })
      .catch(() => setServerConfigured(false));

    loadSourceHistory();
  }, [sourceId]);

  async function loadSourceHistory() {
    try {
      const res = await fetch("/api/runs");
      const data = await res.json();
      if (data?.runs) {
        setSourceRuns(data.runs.filter((r: any) => r.source_id?.startsWith(sourceId)));
      }
    } catch {}
  }

  // Parse workflow chaining URL params and update form reactively
	useEffect(() => {
		const stageId = searchParams.get("stageId");
		if (stageId) {
			// Fetch server-staged pipeline payload
			fetch(`/api/pipelines/stage/${stageId}`)
				.then((res) => res.json())
				.then((data) => {
					if (data?.stage?.payload) {
						const stagedPayload = data.stage.payload;
						setFormData((prev) => ({
							...prev,
							...stagedPayload,
						}));
						setStatus("Pre-loaded staged leads from previous workflow run.");
					}
				})
				.catch(() => {});
		}
	}, [searchParams]);

  const activeTool = useMemo(() => {
    return manifest?.tools.find((t) => t.id === activeToolId);
  }, [manifest, activeToolId]);

  function handleToolChange(toolId: string) {
    setActiveToolId(toolId);
    const tool = manifest?.tools.find((t) => t.id === toolId);
    if (tool) {
      const defaults: Record<string, any> = {};
      for (const f of tool.fields) defaults[f.name] = f.default;
      setFormData(defaults);
      setError(null);
      setRunResult(null);
    }
  }

  function handleInputChange(field: FieldDefinition, value: any) {
    setFormData((prev) => ({
      ...prev,
      [field.name]: field.type === "number" ? Number(value) : value,
    }));
  }

  // Live polling hook for background Apify runs
  useEffect(() => {
    if (!runResult?.runId || runResult.status !== "running") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/runs/${runResult.runId}/sync`, { method: "POST" });
        const data = await res.json().catch(() => null);

        if (data?.status === "succeeded") {
          setRunResult(data);
          setStatus("Scrape completed! Discovered leads ingested into your database.");
          loadSourceHistory();
          clearInterval(interval);
        } else if (data?.status === "failed") {
          setError(data.error || "Actor run failed on Apify.");
          setRunResult(data);
          clearInterval(interval);
        }
      } catch (err) {}
    }, 5000);

    return () => clearInterval(interval);
  }, [runResult?.runId, runResult?.status]);

  async function handleLaunch() {
    if (!activeTool) return;
    setSubmitting(true);
    setError(null);
    setRunResult(null);
    setStatus(`Dispatching ${manifest?.name} (${activeTool.name})...`);

    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: manifest?.id,
          tool: activeTool.id,
          input: formData,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || `Execution failed with status ${res.status}`);
      }

      setRunResult(data);
      if (data.status === "succeeded") {
        setStatus("Execution completed! Results deduped and stored in database.");
      } else {
        setStatus("Actor is actively crawling on Apify cloud. Syncing results automatically...");
      }
      loadSourceHistory();
    } catch (err: any) {
      setError(err.message);
      setStatus(null);
    } finally {
      setSubmitting(false);
    }
  }

  if (!manifest) {
    return (
      <div className="card max-w-lg mx-auto text-center py-12 space-y-4">
        <h2 className="text-xl font-bold">Source Provider Not Found</h2>
        <Link href="/sources" className="btn-primary inline-flex">← Back to Sources Hub</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{manifest.name}</h1>
            <span className="badge-teal text-[11px]">{manifest.badge}</span>
          </div>
          <p className="text-sm text-gray-500 mt-1">{manifest.description}</p>
        </div>
        <Link href="/sources" className="btn-outline text-xs">← Back to Sources</Link>
      </div>

      {serverConfigured === false && manifest.missingConfigNotice && (
        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center justify-between">
          <span>⚠️ {manifest.missingConfigNotice}</span>
          <Link href="/settings" className="underline font-semibold ml-2">Configure in Settings →</Link>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card space-y-5 lg:col-span-1">
          {manifest.tools.length > 1 && (
            <div>
              <label className="block text-xs font-semibold mb-1 text-gray-500 uppercase tracking-wider">
                Select Tool / Scraper Actor
              </label>
              <select
                value={activeToolId}
                onChange={(e) => handleToolChange(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                style={{ borderColor: "var(--border)" }}
              >
                {manifest.tools.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          {activeTool && (
            <div className="p-3 rounded bg-gray-50 border text-xs text-gray-600 leading-relaxed" style={{ borderColor: "var(--border)" }}>
              {activeTool.description}
            </div>
          )}

          {activeTool && (
            <div className="space-y-4">
              {activeTool.fields.map((field) => (
                <div key={field.name}>
                  <label className="block text-xs font-semibold mb-1 text-gray-700">{field.label}</label>
                  {field.type === "select" && field.options ? (
                    <select
                      value={formData[field.name] ?? ""}
                      onChange={(e) => handleInputChange(field, e.target.value)}
                      className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                      style={{ borderColor: "var(--border)" }}
                    >
                      {field.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type === "number" ? "number" : "text"}
                      placeholder={field.placeholder}
                      value={formData[field.name] ?? ""}
                      onChange={(e) => handleInputChange(field, e.target.value)}
                      className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                      style={{ borderColor: "var(--border)" }}
                    />
                  )}
                  {field.helperText && <p className="text-[11px] mt-1 text-gray-400">{field.helperText}</p>}
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="p-3 rounded bg-red-50 text-red-700 text-xs border border-red-200">
              <b>Error:</b> {error}
            </div>
          )}

          {status && !error && (
            <div className="p-3 rounded bg-[#e6f2ee] text-[#0f6e56] text-xs border border-[#0f6e56]/30 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#0f6e56] animate-pulse"></span>
              <span>{status}</span>
            </div>
          )}

          <button
            onClick={handleLaunch}
            disabled={submitting || serverConfigured === false}
            className="btn-primary w-full justify-center disabled:opacity-50"
          >
            {submitting ? "Executing Scraper..." : `Launch ${activeTool?.name || "Tool"}`}
          </button>
        </div>

        {/* Live Execution Monitor */}
        <div className="card lg:col-span-2 space-y-4">
          <h2 className="text-base font-semibold">Real-Time Execution Monitor</h2>
          {runResult ? (
            <div className="p-5 rounded-lg border bg-[#f7f7f5] space-y-4" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm">Run ID: {runResult.runId}</div>
                  {runResult.apifyRunId && (
                    <div className="text-xs text-gray-500 font-mono mt-0.5">
                      Apify Run ID: {runResult.apifyRunId}
                    </div>
                  )}
                </div>
                <span className={`capitalize font-semibold text-xs px-2.5 py-1 rounded-full ${
                  runResult.status === "succeeded" ? "bg-[#e6f2ee] text-[#0f6e56]" : "bg-amber-100 text-amber-800 animate-pulse"
                }`}>
                  {runResult.status}
                </span>
              </div>

              {runResult.apifyConsoleUrl && (
                <div className="p-3 bg-white rounded border text-xs flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
                  <span className="text-gray-600">Live crawler logs on Apify:</span>
                  <a
                    href={runResult.apifyConsoleUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#0f6e56] font-semibold underline text-xs ml-2"
                  >
                    Open Apify Console ↗
                  </a>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="bg-white p-4 rounded border text-center" style={{ borderColor: "var(--border)" }}>
                  <div className="text-xs text-gray-500">Raw Items Discovered</div>
                  <div className="text-2xl font-bold mt-1">{runResult.recordsFound ?? 0}</div>
                </div>
                <div className="bg-white p-4 rounded border text-center" style={{ borderColor: "var(--border)" }}>
                  <div className="text-xs text-gray-500">Canonical Leads Deduped</div>
                  <div className="text-2xl font-bold mt-1 text-emerald-800">{runResult.recordsDeduped ?? 0}</div>
                </div>
              </div>

              {/* Direct route to that run's scoped leads */}
              {runResult.status === "succeeded" && (
                <div className="pt-2 flex justify-end gap-2">
                  <Link href={`/runs/${runResult.runId}`} className="btn-primary text-xs">
                    Inspect This Run's Leads ({runResult.recordsDeduped ?? 0}) →
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-20 text-sm text-gray-400">
              Configure parameters on the left and click <b>Launch</b>. Discovered leads will be deduplicated, scored, and stored in your database.
            </div>
          )}
        </div>
      </div>

      {/* Historical Runs for this Specific Provider */}
      <div className="card overflow-hidden p-0">
        <div className="p-4 border-b font-semibold text-sm bg-[#f7f7f5]" style={{ borderColor: "var(--border)" }}>
          Run History for {manifest.name} ({sourceRuns.length})
        </div>
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b text-xs text-gray-600 bg-white" style={{ borderColor: "var(--border)" }}>
              <th className="py-2.5 px-4">Run ID</th>
              <th className="py-2.5 px-4">Tool</th>
              <th className="py-2.5 px-4">Status</th>
              <th className="py-2.5 px-4">Raw Found</th>
              <th className="py-2.5 px-4">Deduped</th>
              <th className="py-2.5 px-4">Date</th>
              <th className="py-2.5 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {sourceRuns.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-6 text-xs text-gray-400">No runs launched yet for this source.</td></tr>
            ) : (
              sourceRuns.map((r) => (
                <tr key={r.id} className="border-b hover:bg-gray-50/50 cursor-pointer" onClick={() => router.push(`/runs/${r.id}`)}>
                  <td className="py-2.5 px-4 font-mono text-xs font-semibold text-[#0f6e56]">{r.id.slice(0, 8)}...</td>
                  <td className="py-2.5 px-4 text-xs font-medium">{r.source_id.split(":")[1] || r.source_id}</td>
                  <td className="py-2.5 px-4"><span className="badge-teal capitalize">{r.status}</span></td>
                  <td className="py-2.5 px-4">{r.records_raw}</td>
                  <td className="py-2.5 px-4 font-bold text-emerald-800">{r.records_deduped}</td>
                  <td className="py-2.5 px-4 text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="py-2.5 px-4 text-right">
                    <span className="text-xs text-[#0f6e56] font-semibold underline">View Scoped Leads →</span>
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
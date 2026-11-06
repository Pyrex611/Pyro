import { config } from "@/lib/config";
import type { LeadCandidate, RawRecord } from "@pyro/core";

const MOLTSETS_BASE_URL = "https://api.moltsets.com/api/v1/tools";
const USER_AGENT = "Pyro/1.0 (PyrexxAI Lead Engine; +https://pyrexxai.com)";

export const VALID_SENIORITIES = [
  "Intern",
  "Entry",
  "Senior",
  "Manager",
  "Director",
  "VP",
  "Head",
  "C Suite",
  "Owner",
  "Partner",
] as const;
export type MoltsetsSeniority = typeof VALID_SENIORITIES[number];

export const EXECUTIVE_SENIORITY_PRESET: MoltsetsSeniority[] = [
  "Owner",
  "C Suite",
  "Partner",
  "VP",
  "Head",
  "Director",
];

export const VALID_INDUSTRIES = [
  "Health and Pharmaceuticals",
  "Professional and Business Services",
  "Information Technology",
  "Retail",
  "Consumer Services",
  "Finance and Banking",
  "Marketing & Advertising",
  "Real Estate",
  "Education",
  "Non-Profit and Social Services",
] as const;

export const VALID_EMPLOYEE_RANGES = [
  "1-10",
  "11-20",
  "21-50",
  "51-200",
  "201-500",
  "501-1000",
  "1001-5000",
  "5001+",
] as const;

export interface MoltsetsResponse<T = any> {
  results: T;
  status: "ok" | "not_found";
  metadata?: {
    tokens_used?: number;
    tokens_remaining?: number;
    fair_use?: {
      records_remaining_5h?: number;
      records_reset_5h?: string;
      records_remaining_1w?: number;
      records_reset_1w?: string;
    };
    phone_tokens_used?: number;
    phone_tokens_remaining?: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

async function callMoltsetsTool<T = any>(
  toolName: string,
  payload: Record<string, any> = {},
  retryOnConcurrency = true
): Promise<MoltsetsResponse<T>> {
  if (!config.moltsetsApiKey) {
    throw new Error("MOLTSETS_API_KEY is missing. Please add it to your environment variables.");
  }

  const url = `${MOLTSETS_BASE_URL}/${toolName}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.moltsetsApiKey}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify(payload),
  });

  const json: MoltsetsResponse<T> = await res.json().catch(() => ({
    results: {} as T,
    status: "not_found",
    error: { code: "invalid_json", message: `HTTP ${res.status}: Failed to parse JSON response` },
  }));

  if (!res.ok || json.error) {
    const errCode = json.error?.code || `http_${res.status}`;
    const errMsg = json.error?.message || "Unknown MoltSets error";

    if (errCode === "search_concurrency_exceeded" && retryOnConcurrency) {
      console.warn("[MOLTSETS] Search concurrency exceeded. Retrying after 1.2s...");
      await new Promise((r) => setTimeout(r, 1200));
      return callMoltsetsTool<T>(toolName, payload, false);
    }

    if (errCode === "insufficient_tokens") {
      throw new Error("MoltSets token balance exhausted. Please top up at app.moltsets.com.");
    }
    if (errCode === "fair_use_limit_exceeded") {
      throw new Error("MoltSets Fair Use record limit reached for this window.");
    }
    if (errCode === "unauthorized") {
      throw new Error("MoltSets API key is invalid or revoked.");
    }

    throw new Error(`MoltSets [${errCode}]: ${errMsg}`);
  }

  return json;
}

function toCleanArray(val: unknown): string[] | undefined {
  if (!val) return undefined;
  if (Array.isArray(val)) {
    const cleaned = val.map((s) => String(s).trim()).filter(Boolean);
    return cleaned.length ? cleaned : undefined;
  }
  if (typeof val === "string") {
    const cleaned = val
      .split(/[\n,]/)
      .map((s) => s.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
      .filter(Boolean);
    return cleaned.length ? cleaned : undefined;
  }
  return undefined;
}

// ============================================================================
// 1. MULTI-PAGE & COMPANY-BALANCED PEOPLE SEARCH (search_people)
// ============================================================================
export interface MoltsetsPeopleInput {
  query?: string;
  title?: string | string[];
  company?: string | string[];
  company_domain?: string | string[];
  country?: string | string[];
  state?: string | string[];
  city?: string | string[];
  seniority?: string | string[];
  industry?: string | string[];
  employee_range?: string | string[];
  exclude_company_domain?: string[];
  limit?: number; // Total target leads (e.g. 20, 50, 100)
  maxPerCompany?: number; // Limit contacts per company (e.g. 1, 2, 3)
}

export async function searchMoltsetsPeople(input: MoltsetsPeopleInput): Promise<{
  rawRecords: RawRecord[];
  candidates: LeadCandidate[];
  metadata?: any;
}> {
  const domains = toCleanArray(input.company_domain);
  const titles = toCleanArray(input.title);
  const countries = toCleanArray(input.country) || ["United States"];
  const states = toCleanArray(input.state);
  const cities = toCleanArray(input.city);

  let seniorities: string[] | undefined = toCleanArray(input.seniority);
  if (seniorities) {
    seniorities = seniorities.filter((s) => VALID_SENIORITIES.includes(s as MoltsetsSeniority));
  } else {
    seniorities = [...EXECUTIVE_SENIORITY_PRESET];
  }

  const targetCount = Math.min(Math.max(Number(input.limit || 20), 1), 100);
  const maxPerCompany = Math.max(Number(input.maxPerCompany || 2), 1);

  const rawRecords: RawRecord[] = [];
  const candidates: LeadCandidate[] = [];
  const companyCounts: Record<string, number> = {};

  let currentOffset = 0;
  let totalAvailable = Infinity;
  let iterations = 0;
  let lastMetadata: any = null;

  console.log(`[MOLTSETS] Starting search: Target=${targetCount} leads, MaxPerCompany=${maxPerCompany}`);

  // Automated pagination loop with inter-company quota protection
  while (candidates.length < targetCount && currentOffset < totalAvailable && iterations < 5) {
    iterations++;
    const pageSize = Math.min(25, (targetCount - candidates.length) * 2); // Fetch in chunks up to 25

    const payload: Record<string, any> = {
      limit: Math.max(pageSize, 10),
      offset: currentOffset,
      country: countries,
      seniority: seniorities.length ? seniorities : undefined,
    };

    if (input.query) payload.query = input.query;
    if (titles) payload.title = titles.length === 1 ? titles[0] : titles;
    if (domains) payload.company_domain = domains.slice(0, 100);
    if (states) payload.state = states.length === 1 ? states[0] : states;
    if (cities) payload.city = cities.length === 1 ? cities[0] : cities;
    if (input.industry) payload.industry = input.industry;
    if (input.employee_range) payload.employee_range = input.employee_range;
    if (input.exclude_company_domain?.length) payload.exclude_company_domain = input.exclude_company_domain.slice(0, 100);

    const response = await callMoltsetsTool<any>("search_people", payload);
    lastMetadata = response.metadata;

    if (response.status === "not_found" || !response.results?.results?.length) {
      console.log(`[MOLTSETS] No further records found at offset ${currentOffset}.`);
      break;
    }

    totalAvailable = response.results.total || totalAvailable;
    const batchPeople: any[] = response.results.results;

    for (const p of batchPeople) {
      if (candidates.length >= targetCount) break;

      const company = p.company || {};
      const companyKey = (company.domain || company.name || p.full_name || "unknown").toLowerCase().trim();

      // Enforce Max Contacts Per Company Quota Guard
      const currentCompanyCount = companyCounts[companyKey] || 0;
      if (maxPerCompany < 99 && currentCompanyCount >= maxPerCompany) {
        // Skip over-represented company to guarantee practice diversity
        continue;
      }
      companyCounts[companyKey] = currentCompanyCount + 1;

      const raw: RawRecord = {
        sourceId: "moltsets",
        sourceRef: p._id || p.linkedin_url || `ms_p_${Math.random().toString(36).substring(2, 9)}`,
        payload: p,
      };

      const riskScore = p.business_email_risk_score;
      const isDeliverable = riskScore === "A" || riskScore === "B";

      const candidate: LeadCandidate = {
        name: company.name || `${p.full_name}'s Medical Practice`,
        niche: p.current_industry || "Healthcare",
        website: company.website_url || (company.domain ? `https://${company.domain}` : undefined),
        city: p.city || undefined,
        state: p.state || undefined,
        email: isDeliverable ? p.business_email : undefined,
        decisionMaker: {
          name: p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim(),
          title: p.title || "Decision Maker",
          email: isDeliverable ? p.business_email : undefined,
          confidence: isDeliverable ? "HIGH" : "MEDIUM",
        },
        signals: [
          ...(p.linkedin_url ? [{ type: "linkedin_url", value: p.linkedin_url }] : []),
          ...(riskScore ? [{ type: "email_risk_score", value: riskScore }] : []),
          ...(p.seniority ? [{ type: "seniority", value: p.seniority }] : []),
          ...(company.size ? [{ type: "company_size", value: company.size }] : []),
          ...(company.domain ? [{ type: "company_domain", value: company.domain }] : []),
        ],
      };

      rawRecords.push(raw);
      candidates.push(candidate);
    }

    currentOffset += batchPeople.length;
    if (batchPeople.length < 10) break; // End of index
  }

  console.log(`[MOLTSETS] Completed! Harvested ${candidates.length} unique candidates across ${Object.keys(companyCounts).length} distinct practices.`);
  return { rawRecords, candidates, metadata: lastMetadata };
}

// ============================================================================
// 2. BATCH DOMAIN DECISION-MAKER FINDER
// ============================================================================
export async function findDecisionMakersForDomains(
  domains: string[],
  options: { title?: string; limit?: number; maxPerCompany?: number; excludedDomains?: string[] } = {}
) {
  return searchMoltsetsPeople({
    company_domain: domains.slice(0, 100),
    seniority: [...EXECUTIVE_SENIORITY_PRESET],
    title: options.title,
    limit: options.limit || 25,
    maxPerCompany: options.maxPerCompany || 2,
    exclude_company_domain: options.excludedDomains,
  });
}

// ============================================================================
// 3. COMPANY SEARCH (search_companies)
// ============================================================================
export async function searchMoltsetsCompanies(input: {
  query?: string;
  industry?: string;
  country?: string[];
  limit?: number;
  offset?: number;
}) {
  const payload = {
    query: input.query || "med spa",
    industry: input.industry || undefined,
    country: input.country || ["United States"],
    limit: Math.min(Math.max(Number(input.limit || 10), 1), 25),
    offset: Number(input.offset || 0),
  };

  const response = await callMoltsetsTool<any>("search_companies", payload);

  if (response.status === "not_found" || !response.results?.results) {
    return { rawRecords: [], candidates: [], metadata: response.metadata };
  }

  const companies: any[] = response.results.results || [];
  const rawRecords: RawRecord[] = [];
  const candidates: LeadCandidate[] = [];

  for (const c of companies) {
    const raw: RawRecord = {
      sourceId: "moltsets",
      sourceRef: c._id || c.domain || `ms_c_${Math.random().toString(36).substring(2, 9)}`,
      payload: c,
    };

    const candidate: LeadCandidate = {
      name: c.name || "Unnamed Clinic",
      niche: c.industry || input.query || "Healthcare",
      website: c.website_url || (c.domain ? `https://${c.domain}` : undefined),
      city: c.city || undefined,
      state: c.state || undefined,
      signals: [
        ...(c.size ? [{ type: "company_size", value: c.size }] : []),
        ...(c.linkedin_url ? [{ type: "company_linkedin", value: c.linkedin_url }] : []),
      ],
    };

    rawRecords.push(raw);
    candidates.push(candidate);
  }

  return { rawRecords, candidates, metadata: response.metadata };
}

// ============================================================================
// 4. LINKEDIN TOOLS (Email, Personal Email, Mobile)
// ============================================================================
export async function moltsetsLinkedinToBestEmail(linkedinUrl: string) {
  const normalizedUrl = linkedinUrl.startsWith("http") ? linkedinUrl : `https://${linkedinUrl}`;
  const response = await callMoltsetsTool<any>("linkedin_to_best_email", { linkedin_url: normalizedUrl });

  if (response.status === "not_found" || !response.results?.email) {
    return { rawRecords: [], candidates: [], metadata: response.metadata };
  }

  const r = response.results;
  const isDeliverable = r.risk_score === "A" || r.risk_score === "B";

  const raw: RawRecord = {
    sourceId: "moltsets",
    sourceRef: `li_best_${Buffer.from(normalizedUrl).toString("base64").substring(0, 16)}`,
    payload: { linkedin_url: normalizedUrl, ...r },
  };

  const candidate: LeadCandidate = {
    name: "Enriched Professional",
    niche: "Enrichment",
    email: isDeliverable ? r.email : undefined,
    decisionMaker: {
      email: isDeliverable ? r.email : undefined,
      confidence: isDeliverable ? "HIGH" : "MEDIUM",
    },
    signals: [
      { type: "linkedin_url", value: normalizedUrl },
      { type: "best_email", value: r.email },
      ...(r.risk_score ? [{ type: "email_risk_score", value: r.risk_score }] : []),
      ...(r.type ? [{ type: "email_type", value: r.type }] : []),
    ],
  };

  return { rawRecords: [raw], candidates: [candidate], metadata: response.metadata };
}

export async function moltsetsLinkedinToPersonalEmail(linkedinUrl: string) {
  const normalizedUrl = linkedinUrl.startsWith("http") ? linkedinUrl : `https://${linkedinUrl}`;
  const response = await callMoltsetsTool<any>("linkedin_to_personal_email_usa", { linkedin_url: normalizedUrl });

  if (response.status === "not_found" || !response.results?.email) {
    return { rawRecords: [], candidates: [], metadata: response.metadata };
  }

  const r = response.results;
  const isDeliverable = r.risk_score === "A" || r.risk_score === "B";

  const raw: RawRecord = {
    sourceId: "moltsets",
    sourceRef: `li_pers_${Buffer.from(normalizedUrl).toString("base64").substring(0, 16)}`,
    payload: { linkedin_url: normalizedUrl, ...r },
  };

  const candidate: LeadCandidate = {
    name: "Enriched US Professional",
    niche: "Enrichment",
    email: isDeliverable ? r.email : undefined,
    decisionMaker: {
      email: isDeliverable ? r.email : undefined,
      confidence: isDeliverable ? "HIGH" : "MEDIUM",
    },
    signals: [
      { type: "linkedin_url", value: normalizedUrl },
      { type: "personal_email_usa", value: r.email },
      ...(r.risk_score ? [{ type: "email_risk_score", value: r.risk_score }] : []),
    ],
  };

  return { rawRecords: [raw], candidates: [candidate], metadata: response.metadata };
}

export async function moltsetsLinkedinToMobilePhone(linkedinUrl: string) {
  const normalizedUrl = linkedinUrl.startsWith("http") ? linkedinUrl : `https://${linkedinUrl}`;
  const response = await callMoltsetsTool<any>("linkedin_to_mobile_phone", { linkedin_url: normalizedUrl });

  if (response.status === "not_found" || !response.results?.phone) {
    return { rawRecords: [], candidates: [], metadata: response.metadata };
  }

  const r = response.results;
  const raw: RawRecord = {
    sourceId: "moltsets",
    sourceRef: `li_mob_${Buffer.from(normalizedUrl).toString("base64").substring(0, 16)}`,
    payload: { linkedin_url: normalizedUrl, ...r },
  };

  const candidate: LeadCandidate = {
    name: "Enriched Mobile Contact",
    niche: "Enrichment",
    phone: r.phone,
    decisionMaker: {
      phone: r.phone,
      confidence: "HIGH",
    },
    signals: [
      { type: "linkedin_url", value: normalizedUrl },
      { type: "carrier_verified_mobile", value: r.phone },
      ...(r.carrier ? [{ type: "phone_carrier", value: r.carrier }] : []),
      ...(r.phone_type ? [{ type: "phone_type", value: r.phone_type }] : []),
    ],
  };

  return { rawRecords: [raw], candidates: [candidate], metadata: response.metadata };
}

export async function getMoltsetsAccountUsage() {
  try {
    const res = await callMoltsetsTool<any>("get_account", {});
    return {
      active: true,
      tokensRemaining: res.metadata?.tokens_remaining,
      fairUse: res.metadata?.fair_use,
    };
  } catch (err: any) {
    return { active: false, error: err.message };
  }
}
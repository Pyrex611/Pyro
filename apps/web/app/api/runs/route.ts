import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDbPool } from "@/lib/db";
import { isNeonConfigured } from "@/lib/config";
import { NeonStore, type LeadCandidate, type RawRecord } from "@pyro/core";
import {
  startApifyActorRun,
  buildFacebookAdsUrl,
} from "@/lib/providers/apify";
import {
  searchMoltsetsPeople,
  searchMoltsetsCompanies,
  findDecisionMakersForDomains,
  moltsetsLinkedinToBestEmail,
  moltsetsLinkedinToPersonalEmail,
  moltsetsLinkedinToMobilePhone,
} from "@/lib/providers/moltsets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RunPayloadSchema = z.object({
  source: z.string().min(1),
  tool: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
});

export async function GET() {
  try {
    if (!isNeonConfigured()) {
      return NextResponse.json({ runs: [] });
    }
    const pool = getDbPool();
    const { rows } = await pool.query(`SELECT * FROM runs ORDER BY created_at DESC LIMIT 50`);
    return NextResponse.json({ runs: rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isNeonConfigured()) {
      return NextResponse.json(
        { error: "DATABASE_URL is missing. Please configure it in your environment variables." },
        { status: 500 }
      );
    }

    const json = await req.json().catch(() => null);
    const parsed = RunPayloadSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid run payload", details: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    const { source: providerId, tool: toolId, input } = parsed.data;
    const pool = getDbPool();
    const store = new NeonStore(process.env.DATABASE_URL!);

    // =======================================================================
    // 1. APIFY ASYNC 202 ACCEPTED DISPATCH (<400ms Response Time)
    // =======================================================================
    if (providerId === "apify") {
      let actorId = "compass/crawler-google-places";
      let actorInput: Record<string, any> = {};

      if (toolId === "facebook-ads") {
        actorId = "curious_coder/facebook-ads-library-scraper";
        const query = String(input.query || "MedSpa in Ohio");
        actorInput = {
          urls: [{ url: buildFacebookAdsUrl(query, String(input.country || "ALL")) }],
          count: Math.min(Number(input.count || 20), 100),
          "scrapePageAds.period": "",
          "scrapePageAds.activeStatus": "active",
          "scrapePageAds.sortBy": "impressions_desc",
          "scrapePageAds.countryCode": input.country || "ALL",
        };
      } else if (toolId === "linkedin-jobs") {
        actorId = "valig/linkedin-jobs-scraper";
        actorInput = {
          keywords: String(input.keywords || "Medical Director"),
          location: String(input.location || "Columbus, OH"),
          datePosted: input.datePosted ? String(input.datePosted) : "r604800",
          limit: Math.min(Number(input.limit || 20), 100),
        };
      } else if (toolId === "google-search") {
        actorId = "apify/google-search-scraper";
        actorInput = {
          queries: String(input.queries || "Hotels in Seattle"),
          countryCode: input.countryCode ? String(input.countryCode) : "us",
          languageCode: "en",
          maxPagesPerQuery: Number(input.maxPagesPerQuery || 1),
        };
      } else {
        actorId = "compass/crawler-google-places";
        actorInput = {
          searchStringsArray: [`${input.keyword || "med spa"} in ${input.city || "Columbus, OH"}`],
          maxCrawledPlacesPerSearch: Math.min(Number(input.maxResults || 20), 100),
          language: "en",
          skipClosedPlaces: true,
        };
      }

      // Start the Apify run immediately (<300ms)
      const { apifyRunId, defaultDatasetId } = await startApifyActorRun(actorId, actorInput);

      // Persist in Neon runs row
      const insertRes = await pool.query(
        `INSERT INTO runs (source_id, input, status, started_at)
         VALUES ($1, $2, 'running', NOW()) RETURNING id`,
        [
          `apify:${toolId}`,
          JSON.stringify({ ...input, toolId, apifyRunId, defaultDatasetId }),
        ]
      );
      const runId = insertRes.rows[0].id;

      // Return 202 Accepted immediately to avoid Vercel 504 timeouts
      return NextResponse.json(
        {
          runId,
          apifyRunId,
          status: "running",
          message: "Actor run dispatched to Apify cloud. Reconciling asynchronously.",
          apifyConsoleUrl: `https://console.apify.com/view/runs/${apifyRunId}`,
        },
        { status: 202 }
      );
    }

    // =======================================================================
    // 2. MOLTSETS B2B DISPATCH (Fast API Execution)
    // =======================================================================
    if (providerId === "moltsets") {
      const insertRes = await pool.query(
        `INSERT INTO runs (source_id, input, status, started_at)
         VALUES ($1, $2, 'running', NOW()) RETURNING id`,
        [`moltsets:${toolId}`, JSON.stringify(input)]
      );
      const runId = insertRes.rows[0].id;

      let excludedDomains: string[] = [];
      try {
        const suppRes = await pool.query(`SELECT value FROM suppression WHERE kind = 'domain' LIMIT 100`);
        excludedDomains = suppRes.rows.map((r: any) => r.value.trim().toLowerCase());
      } catch {}

      let rawRecords: RawRecord[] = [];
      let candidates: LeadCandidate[] = [];

      if (toolId === "search_people") {
        let seniority: string[] | undefined;
        if (input.seniority_preset === "all_executives") {
          seniority = ["Owner", "C Suite", "Partner", "VP", "Head", "Director"];
        } else if (input.seniority_preset === "owners_only") {
          seniority = ["Owner", "Partner"];
        }

        const out = await searchMoltsetsPeople({
          title: input.title ? String(input.title) : undefined,
          country: input.country ? String(input.country) : "United States",
          state: input.state ? String(input.state) : undefined,
          seniority,
          industry: input.industry ? String(input.industry) : undefined,
          employee_range: input.employee_range ? String(input.employee_range) : undefined,
          limit: Number(input.limit || 20),
          maxPerCompany: Number(input.maxPerCompany || 2),
          exclude_company_domain: excludedDomains,
        });
        rawRecords = out.rawRecords;
        candidates = out.candidates;
      } else if (toolId === "batch_domains") {
        const rawDomains = String(input.domains || "");
        const domainList = rawDomains.split(/[\n,]/).map((d) => d.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "")).filter(Boolean);
        const out = await findDecisionMakersForDomains(domainList, {
          title: input.title ? String(input.title) : undefined,
          limit: Number(input.limit || 25),
          maxPerCompany: Number(input.maxPerCompany || 2),
          excludedDomains,
        });
        rawRecords = out.rawRecords;
        candidates = out.candidates;
      } else if (toolId === "search_companies") {
        const out = await searchMoltsetsCompanies({
          query: String(input.query || "med spa"),
          limit: Number(input.limit || 10),
        });
        rawRecords = out.rawRecords;
        candidates = out.candidates;
      } else if (toolId === "linkedin_to_best_email") {
        const out = await moltsetsLinkedinToBestEmail(String(input.linkedin_url));
        rawRecords = out.rawRecords;
        candidates = out.candidates;
      } else if (toolId === "linkedin_to_personal_email_usa") {
        const out = await moltsetsLinkedinToPersonalEmail(String(input.linkedin_url));
        rawRecords = out.rawRecords;
        candidates = out.candidates;
      } else if (toolId === "linkedin_to_mobile_phone") {
        const out = await moltsetsLinkedinToMobilePhone(String(input.linkedin_url));
        rawRecords = out.rawRecords;
        candidates = out.candidates;
      }

      const batch = rawRecords.map((raw, i) => ({ raw, candidate: candidates[i]! }));
      const dedupedCount = await store.ingestBatch(runId, `moltsets:${toolId}`, batch);

      await pool.query(
        `UPDATE runs SET records_raw = $1, records_deduped = $2, status = 'succeeded', finished_at = NOW() WHERE id = $3`,
        [rawRecords.length, dedupedCount, runId]
      );

      return NextResponse.json({
        runId,
        status: "succeeded",
        recordsFound: rawRecords.length,
        recordsDeduped: dedupedCount,
      });
    }

    // =======================================================================
    // 3. SYNTHETIC LOCAL MOCK DISPATCH
    // =======================================================================
    const insertRes = await pool.query(
      `INSERT INTO runs (source_id, input, status, started_at) VALUES ('mock', '{}', 'running', NOW()) RETURNING id`
    );
    const runId = insertRes.rows[0].id;
    const timestamp = Date.now();
    const rawRecords = [
      { sourceId: "mock", sourceRef: `m1_${timestamp}`, payload: { name: "Glow Aesthetics" } },
      { sourceId: "mock", sourceRef: `m2_${timestamp}`, payload: { name: "Columbus Skin Lab" } },
    ];
    const candidates: LeadCandidate[] = [
      { name: "Glow Aesthetics", niche: "med spa", phone: "+16145550101", website: "https://glowaesthetics.example.com", city: "Columbus", state: "OH", decisionMaker: { name: "Dr. Sarah Vance", title: "Medical Director", confidence: "HIGH" }, signals: [{ type: "ad_active", value: true }, { type: "rating", value: 4.9 }] },
      { name: "Columbus Skin Lab", niche: "med spa", phone: "+16145550102", city: "Columbus", state: "OH", signals: [{ type: "no_website", value: true }] },
    ];

    const batch = rawRecords.map((raw, i) => ({ raw, candidate: candidates[i]! }));
    const dedupedCount = await store.ingestBatch(runId, "mock:synthetic", batch);

    await pool.query(
      `UPDATE runs SET records_raw = $1, records_deduped = $2, status = 'succeeded', finished_at = NOW() WHERE id = $3`,
      [rawRecords.length, dedupedCount, runId]
    );

    return NextResponse.json({
      runId,
      status: "succeeded",
      recordsFound: rawRecords.length,
      recordsDeduped: dedupedCount,
    });
  } catch (err: any) {
    console.error("[POST /api/runs error]:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
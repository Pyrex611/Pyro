import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { isNeonConfigured } from "@/lib/config";
import { NeonStore, type LeadCandidate } from "@pyro/core";
import {
  mapFacebookAdsItems,
  mapLinkedinJobsItems,
  mapGoogleSearchItems,
  mapGooglePlacesItems,
} from "@/lib/providers/apify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!isNeonConfigured()) {
      return NextResponse.json({ error: "DATABASE_URL is not configured" }, { status: 500 });
    }

    const runId = params.id;
    const pool = getDbPool();

    // 1. Fetch Run details
    const runRes = await pool.query(`SELECT * FROM runs WHERE id = $1`, [runId]);
    if (!runRes.rows.length) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const run = runRes.rows[0];
    const sourceId = run.source_id || "";
    const toolId = sourceId.split(":")[1] || "gmaps";

    // 2. Fetch raw records already stored in Neon for this run
    const rawRes = await pool.query(
      `SELECT source_id, source_ref, payload FROM raw_records WHERE run_id = $1`,
      [runId]
    );

    if (!rawRes.rows.length) {
      return NextResponse.json({ error: "No raw records found on file for this run to re-parse." }, { status: 400 });
    }

    const items = rawRes.rows.map((r: any) => r.payload);
    let candidates: LeadCandidate[] = [];

    // 3. Re-evaluate through updated mappers
    if (toolId === "facebook-ads") {
      const out = mapFacebookAdsItems(items, run.input?.query || "Healthcare Ads");
      candidates = out.candidates;
    } else if (toolId === "linkedin-jobs") {
      const out = mapLinkedinJobsItems(items, run.input?.keywords || "Healthcare Hiring");
      candidates = out.candidates;
    } else if (toolId === "google-search") {
      const out = mapGoogleSearchItems(items, run.input?.queries || "Search");
      candidates = out.candidates;
    } else {
      const out = mapGooglePlacesItems(items, run.input?.keyword || "healthcare");
      candidates = out.candidates;
    }

    // 4. Re-ingest into Neon with fresh deduplication and v2.1 intelligent scoring
    const store = new NeonStore(process.env.DATABASE_URL!);
    const batch = rawRes.rows.map((r: any, i: number) => ({
      raw: { sourceId: r.source_id, sourceRef: r.source_ref, payload: r.payload },
      candidate: candidates[i]!,
    }));

    const dedupedCount = await store.ingestBatch(runId, sourceId, batch);

    // 5. Update Run counters
    await pool.query(
      `UPDATE runs SET records_deduped = $1, status = 'succeeded', finished_at = NOW() WHERE id = $2`,
      [dedupedCount, runId]
    );

    return NextResponse.json({
      ok: true,
      message: `Successfully re-parsed ${items.length} raw records into ${dedupedCount} canonical leads with updated scores!`,
      recordsRaw: items.length,
      recordsDeduped: dedupedCount,
    });
  } catch (err: any) {
    console.error("[REFRESH Error]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
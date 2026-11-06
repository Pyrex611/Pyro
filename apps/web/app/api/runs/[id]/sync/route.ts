import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { isNeonConfigured } from "@/lib/config";
import { NeonStore } from "@pyro/core";
import {
  getApifyRunStatus,
  fetchApifyDatasetItems,
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

    // 1. Fetch Pyro Run Row
    const runRes = await pool.query(`SELECT * FROM runs WHERE id = $1`, [runId]);
    if (!runRes.rows.length) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const run = runRes.rows[0];
    const input = run.input || {};
    const apifyRunId = input.apifyRunId;
    const datasetId = input.defaultDatasetId;
    const toolId = input.toolId || "gmaps";

    if (!apifyRunId || !datasetId) {
      return NextResponse.json({
        runId,
        status: run.status,
        message: "This run is not tied to an external Apify run.",
      });
    }

    // 2. Check live status on Apify
    const apifyInfo = await getApifyRunStatus(apifyRunId);
    console.log(`[SYNC] Apify Run ${apifyRunId} Status: ${apifyInfo.status}`);

    if (apifyInfo.status === "RUNNING" || apifyInfo.status === "READY") {
      return NextResponse.json({
        runId,
        apifyRunId,
        status: "running",
        message: "Actor is still actively crawling data on Apify cloud...",
        apifyConsoleUrl: `https://console.apify.com/view/runs/${apifyRunId}`,
      });
    }

    if (apifyInfo.status === "FAILED" || apifyInfo.status === "ABORTED" || apifyInfo.status === "TIMED-OUT") {
      await pool.query(
        `UPDATE runs SET status = 'failed', error = $1, finished_at = NOW() WHERE id = $2`,
        [`Apify run terminated with status: ${apifyInfo.status}`, runId]
      );
      return NextResponse.json({
        runId,
        status: "failed",
        error: `Apify run terminated with status: ${apifyInfo.status}`,
      });
    }

    // 3. Status is SUCCEEDED: Fetch Dataset Items!
    const items = await fetchApifyDatasetItems(datasetId);
    console.log(`[SYNC] Fetched ${items.length} items from Apify dataset ${datasetId}`);

    let rawRecords: any[] = [];
    let candidates: any[] = [];

    if (toolId === "facebook-ads") {
      const out = mapFacebookAdsItems(items, input.query || "ads");
      rawRecords = out.rawRecords;
      candidates = out.candidates;
    } else if (toolId === "linkedin-jobs") {
      const out = mapLinkedinJobsItems(items, input.keywords || "jobs");
      rawRecords = out.rawRecords;
      candidates = out.candidates;
    } else if (toolId === "google-search") {
      const out = mapGoogleSearchItems(items, input.queries || "search");
      rawRecords = out.rawRecords;
      candidates = out.candidates;
    } else {
      const out = mapGooglePlacesItems(items, input.keyword || "places");
      rawRecords = out.rawRecords;
      candidates = out.candidates;
    }

    // 4. Ingest into Neon
    const store = new NeonStore(process.env.DATABASE_URL!);
    const batch = rawRecords.map((raw, i) => ({ raw, candidate: candidates[i]! }));
    const dedupedCount = await store.ingestBatch(runId, `apify:${toolId}`, batch);

    // 5. Update Run to succeeded
    await pool.query(
      `UPDATE runs SET records_raw = $1, records_deduped = $2, status = 'succeeded', finished_at = NOW() WHERE id = $3`,
      [rawRecords.length, dedupedCount, runId]
    );

    return NextResponse.json({
      runId,
      status: "succeeded",
      recordsFound: rawRecords.length,
      recordsDeduped: dedupedCount,
      apifyConsoleUrl: `https://console.apify.com/view/runs/${apifyRunId}`,
    });
  } catch (err: any) {
    console.error("[SYNC Error]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { config, isNeonConfigured } from "@/lib/config";
import { NeonStore } from "@pyro/core";
import { mapPlaceToCandidate } from "@pyro/source-gmaps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // 60s timeout

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const runId = params.id;

  if (!isNeonConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL is not configured" }, { status: 500 });
  }

  const pool = getDbPool();
  const store = new NeonStore(config.databaseUrl);

  try {
    const runRes = await pool.query(`SELECT * FROM runs WHERE id = $1`, [runId]);
    if (!runRes.rows.length) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const run = runRes.rows[0];
    const input = run.input;

    await pool.query(
      `UPDATE runs SET status = 'running', started_at = NOW(), heartbeat_at = NOW() WHERE id = $1`,
      [runId]
    );

    const scraperPayload = {
      city: input?.city || "Columbus, OH",
      keyword: input?.keyword || "med spa",
      radius: input?.radius || 3000,
      areas: input?.areas && input?.areas.length ? input.areas : undefined,
    };

    console.log(`[EXECUTE] Calling scraper endpoint: ${config.gmapsServiceUrl}/scrape`);

    const scraperRes = await fetch(`${config.gmapsServiceUrl.replace(/\/$/, "")}/scrape`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.gmapsServiceToken ? { authorization: `Bearer ${config.gmapsServiceToken}` } : {}),
      },
      body: JSON.stringify(scraperPayload),
      signal: AbortSignal.timeout(55000),
    });

    if (!scraperRes.ok) {
      const errText = await scraperRes.text().catch(() => "Unknown scraper error");
      throw new Error(`Scraper returned ${scraperRes.status}: ${errText.slice(0, 300)}`);
    }

    const data = await scraperRes.json();
    const rawResults: any[] = data?.results ?? [];

    const candidates = rawResults.map((place: any) => {
      const raw = {
        sourceId: "gmaps",
        sourceRef: place.place_id || `cr_${Math.random().toString(36).substring(2, 9)}`,
        payload: { ...place, searchKeyword: input?.keyword || "healthcare" },
      };
      const candidate = mapPlaceToCandidate(raw, input?.keyword || "healthcare");
      return { raw, candidate };
    });

    const dedupedCount = await store.ingestBatch(runId, "gmaps", candidates);

    await pool.query(
      `UPDATE runs SET
         records_raw = $1,
         records_deduped = $2,
         status = 'succeeded',
         finished_at = NOW()
       WHERE id = $3`,
      [rawResults.length, dedupedCount, runId]
    );

    return NextResponse.json({
      ok: true,
      recordsFound: rawResults.length,
      recordsDeduped: dedupedCount,
      status: "succeeded",
    });
  } catch (err: any) {
    console.error("[EXECUTE Error]:", err);
    await pool.query(
      `UPDATE runs SET status = 'failed', error = $1, finished_at = NOW() WHERE id = $2`,
      [err.message, runId]
    );
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
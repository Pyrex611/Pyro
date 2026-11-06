import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getDbPool } from "@/lib/db";
import { config } from "@/lib/config";
import { NeonStore } from "@pyro/core";
import { mapPlaceToCandidate } from "@pyro/source-gmaps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const runId = params.id;
  const rawBody = await req.text();
  const signature = req.headers.get("x-pyro-signature") ?? "";

  // 1. Verify HMAC-SHA256 Signature
  if (config.webhookSecret) {
    const hmac = createHmac("sha256", config.webhookSecret);
    const expected = hmac.update(rawBody).digest("hex");
    const sigBuf = Buffer.from(signature, "hex");
    const expBuf = Buffer.from(expected, "hex");

    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return NextResponse.json({ error: "Invalid HMAC signature" }, { status: 401 });
    }
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const pool = getDbPool();
  const store = new NeonStore(config.databaseUrl);

  try {
    // 2. Handle failure callbacks
    if (body.status === "failed") {
      await pool.query(
        `UPDATE runs SET status = 'failed', error = $1, finished_at = NOW() WHERE id = $2`,
        [body.error ?? "Scraper failed execution", runId]
      );
      return NextResponse.json({ ok: true });
    }

    // 3. Process batches of places
    const results: any[] = body.results ?? [];
    const keyword = body.keyword ?? "med spa";

    const candidates = results.map((place: any) => {
      const raw = {
        sourceId: "gmaps",
        sourceRef: place.place_id ?? `g_${Math.random()}`,
        payload: { ...place, searchKeyword: keyword },
      };
      const candidate = mapPlaceToCandidate(raw, keyword);
      return { raw, candidate };
    });

    const dedupedCount = await store.ingestBatch(runId, "gmaps", candidates);

    // 4. Update Run Counts and Heartbeat
    await pool.query(
      `UPDATE runs SET
         records_raw = records_raw + $1,
         records_deduped = records_deduped + $2,
         status = $3,
         heartbeat_at = NOW(),
         finished_at = CASE WHEN $3 = 'succeeded' THEN NOW() ELSE finished_at END
       WHERE id = $4`,
      [results.length, dedupedCount, body.isFinal ? "succeeded" : "running", runId]
    );

    return NextResponse.json({
      ok: true,
      recordsProcessed: results.length,
      dedupedCount,
      runStatus: body.isFinal ? "succeeded" : "running",
    });
  } catch (err: any) {
    console.error("[Webhook Error]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { toCsvString } from "@/lib/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const pool = getDbPool();
    const format = req.nextUrl.searchParams.get("format");
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 500), 2000);

    const { rows: rawRows } = await pool.query(
      `SELECT source_id, source_ref, payload, fetched_at FROM raw_records WHERE run_id = $1 LIMIT $2`,
      [params.id, limit]
    );

    const records = rawRows.map((r) => ({
      source: r.source_id,
      sourceId: r.source_ref,
      name: r.payload?.name,
      phone: r.payload?.international_phone_number ?? r.payload?.formatted_phone_number,
      website: r.payload?.website,
      address: r.payload?.formatted_address,
      rating: r.payload?.rating,
      signals: r.payload?.fallback_data ?? {},
    }));

    if (format === "csv") {
      return new NextResponse(toCsvString(records), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="run_${params.id}.csv"`,
        },
      });
    }

    if (format === "jsonl") {
      const body = records.map((r) => JSON.stringify(r)).join("\n") + (records.length ? "\n" : "");
      return new NextResponse(body, {
        headers: {
          "content-type": "application/x-ndjson",
          "content-disposition": `attachment; filename="run_${params.id}.jsonl"`,
        },
      });
    }

    return NextResponse.json({ records, count: records.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { isNeonConfigured } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    if (!isNeonConfigured()) {
      return NextResponse.json({ error: "DATABASE_URL is not configured" }, { status: 500 });
    }
    const pool = getDbPool();
    const body = await req.json();
    const { target, leadIds } = body;

    if (!target || !Array.isArray(leadIds) || !leadIds.length) {
      return NextResponse.json({ error: "target and leadIds are required" }, { status: 400 });
    }

    const res = await pool.query(
      `INSERT INTO exports (target, lead_ids, status, response)
       VALUES ($1, $2, 'completed', $3) RETURNING id`,
      [target, leadIds, JSON.stringify({ exportedCount: leadIds.length })]
    );

    return NextResponse.json({ ok: true, exportId: res.rows[0].id, count: leadIds.length }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
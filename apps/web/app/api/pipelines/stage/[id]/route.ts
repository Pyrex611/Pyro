import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { isNeonConfigured } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!isNeonConfigured()) {
      return NextResponse.json({ error: "DATABASE_URL is missing" }, { status: 500 });
    }

    const pool = getDbPool();
    const res = await pool.query(
      `SELECT target_provider, target_tool, payload, created_at 
       FROM pipeline_stages 
       WHERE id = $1 AND expires_at > NOW()`,
      [params.id]
    );

    if (!res.rows.length) {
      return NextResponse.json({ error: "Pipeline stage not found or expired" }, { status: 404 });
    }

    return NextResponse.json({ stage: res.rows[0] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
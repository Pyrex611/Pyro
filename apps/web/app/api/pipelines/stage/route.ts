import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { isNeonConfigured } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    if (!isNeonConfigured()) {
      return NextResponse.json({ error: "DATABASE_URL is missing" }, { status: 500 });
    }

    const body = await req.json();
    const { targetProvider, targetTool, payload } = body;

    if (!targetProvider || !targetTool || !payload) {
      return NextResponse.json({ error: "targetProvider, targetTool, and payload are required." }, { status: 400 });
    }

    const pool = getDbPool();
    const res = await pool.query(
      `INSERT INTO pipeline_stages (target_provider, target_tool, payload)
       VALUES ($1, $2, $3) RETURNING id`,
      [targetProvider, targetTool, JSON.stringify(payload)]
    );

    return NextResponse.json({ stageId: res.rows[0].id }, { status: 201 });
  } catch (err: any) {
    console.error("[PIPELINE STAGE ERROR]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
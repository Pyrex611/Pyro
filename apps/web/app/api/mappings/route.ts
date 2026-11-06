import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { isNeonConfigured } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    if (!isNeonConfigured()) {
      return NextResponse.json({ mappings: {} });
    }
    const sourceId = req.nextUrl.searchParams.get("sourceId");
    if (!sourceId) {
      return NextResponse.json({ error: "sourceId is required" }, { status: 400 });
    }

    const pool = getDbPool();
    const { rows } = await pool.query(
      `SELECT mappings, custom_definitions FROM source_field_mappings WHERE source_id = $1`,
      [sourceId]
    );

    return NextResponse.json({
      sourceId,
      mappings: rows[0]?.mappings || {},
      customDefinitions: rows[0]?.custom_definitions || [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isNeonConfigured()) {
      return NextResponse.json({ error: "DATABASE_URL is not configured" }, { status: 500 });
    }
    const pool = getDbPool();
    const body = await req.json();
    const { sourceId, mappings, customDefinitions } = body;

    if (!sourceId || !mappings) {
      return NextResponse.json({ error: "sourceId and mappings are required" }, { status: 400 });
    }

    await pool.query(
      `INSERT INTO source_field_mappings (source_id, mappings, custom_definitions, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (source_id) DO UPDATE SET
         mappings = EXCLUDED.mappings,
         custom_definitions = EXCLUDED.custom_definitions,
         updated_at = NOW()`,
      [sourceId, JSON.stringify(mappings), JSON.stringify(customDefinitions || [])]
    );

    return NextResponse.json({ ok: true, sourceId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
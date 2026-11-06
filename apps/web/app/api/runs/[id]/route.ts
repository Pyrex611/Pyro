import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const pool = getDbPool();
    const { rows } = await pool.query(`SELECT * FROM runs WHERE id = $1`, [params.id]);
    if (!rows.length) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    return NextResponse.json({ run: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.action !== "cancel") {
      return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }
    const pool = getDbPool();
    await pool.query(
      `UPDATE runs SET status = 'canceled', finished_at = NOW() WHERE id = $1 AND status IN ('queued', 'running')`,
      [params.id]
    );
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const pool = getDbPool();
    // Cascades automatically to raw_records
    await pool.query(`DELETE FROM runs WHERE id = $1`, [params.id]);
    return NextResponse.json({ ok: true, deletedRunId: params.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
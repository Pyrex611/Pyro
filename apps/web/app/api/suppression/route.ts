import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { isNeonConfigured } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    if (!isNeonConfigured()) {
      return NextResponse.json({ items: [], count: 0 });
    }
    const pool = getDbPool();
    const kind = req.nextUrl.searchParams.get("kind");

    let sql = `SELECT id, kind, value, reason, created_at FROM suppression`;
    const params: any[] = [];
    if (kind && (kind === "domain" || kind === "email" || kind === "phone")) {
      sql += ` WHERE kind = $1`;
      params.push(kind);
    }
    sql += ` ORDER BY created_at DESC LIMIT 200`;

    const { rows } = await pool.query(sql, params);
    return NextResponse.json({ items: rows, count: rows.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const pool = getDbPool();
    const body = await req.json();
    const { kind, value, reason } = body;

    if (!kind || !value) {
      return NextResponse.json({ error: "kind and value are required" }, { status: 400 });
    }

    const cleanValue = String(value).trim().toLowerCase();

    await pool.query(
      `INSERT INTO suppression (kind, value, reason)
       VALUES ($1, $2, $3)
       ON CONFLICT (kind, value) DO UPDATE SET reason = EXCLUDED.reason`,
      [kind, cleanValue, reason || "Manually added via suppression manager"]
    );

    return NextResponse.json({ ok: true, value: cleanValue }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const pool = getDbPool();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await pool.query(`DELETE FROM suppression WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
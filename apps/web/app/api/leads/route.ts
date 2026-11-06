import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { isNeonConfigured } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    if (!isNeonConfigured()) {
      return NextResponse.json({ items: [], pagination: { total: 0, page: 1, pageSize: 25, totalPages: 1 } });
    }

    const pool = getDbPool();
    const searchParams = req.nextUrl.searchParams;
    const view = searchParams.get("view") || "companies"; // "companies" | "personnel"
    const search = searchParams.get("search")?.trim().toLowerCase();
    const runId = searchParams.get("runId");
    const page = Math.max(Number(searchParams.get("page") ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize") ?? 25), 5), 100);
    const offset = (page - 1) * pageSize;

    // =======================================================================
    // VIEW 1: COMPANIES / PRACTICES
    // =======================================================================
    if (view === "companies") {
      const conditions: string[] = [];
      const values: unknown[] = [];
      let i = 1;

      // Direct, reliable run scoping via lead_sources.run_id
      if (runId) {
        conditions.push(`l.id IN (
          SELECT ls.lead_id FROM lead_sources ls WHERE ls.run_id = $${i++}
          UNION
          SELECT l2.id FROM leads l2
          JOIN raw_records rr ON rr.source_id = 'gmaps' AND rr.payload->>'place_id' = l2.dedupe_key
          WHERE rr.run_id = $1
        )`);
        values.push(runId);
      }

      if (search) {
        conditions.push(`(LOWER(l.name) LIKE $${i} OR LOWER(l.city) LIKE $${i} OR l.phone_e164 LIKE $${i} OR LOWER(l.domain) LIKE $${i})`);
        values.push(`%${search}%`);
        i++;
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const sql = `
        SELECT DISTINCT l.id, l.name, l.niche, l.phone_e164, l.email, l.website, l.domain, l.city, l.state, l.address,
               l.decision_maker, l.signals, l.score, l.score_reasons, l.status, l.dedupe_key, l.custom_fields, l.created_at,
               (SELECT COUNT(*) FROM personnel p WHERE p.company_id = l.id) AS staff_count,
               COUNT(*) OVER() AS full_count
        FROM leads l
        ${whereClause}
        ORDER BY l.score DESC, l.created_at DESC
        LIMIT $${i++} OFFSET $${i++}
      `;
      values.push(pageSize, offset);

      const { rows } = await pool.query(sql, values);
      const total = rows.length > 0 ? Number(rows[0].full_count) : 0;
      const totalPages = Math.ceil(total / pageSize);
      const items = rows.map(({ full_count, ...rest }) => rest);

      return NextResponse.json({
        view: "companies",
        items,
        pagination: { total, page, pageSize, totalPages },
      });
    }

    // =======================================================================
    // VIEW 2: PERSONNEL / STAFF
    // =======================================================================
    const conditions: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    // Personnel run scoping: scoped through parent company's run attribution
    if (runId) {
      conditions.push(`p.company_id IN (
        SELECT ls.lead_id FROM lead_sources ls WHERE ls.run_id = $${i++}
      )`);
      values.push(runId);
    }

    if (search) {
      conditions.push(`(LOWER(p.full_name) LIKE $${i} OR LOWER(p.title) LIKE $${i} OR LOWER(p.direct_email) LIKE $${i} OR LOWER(l.name) LIKE $${i})`);
      values.push(`%${search}%`);
      i++;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const sql = `
      SELECT p.id, p.company_id, p.full_name, p.title, p.seniority, p.direct_email, p.email_risk_score,
             p.direct_phone, p.linkedin_url, p.is_primary_decision_maker, p.created_at,
             l.name AS company_name, l.domain AS company_domain, l.city, l.state, l.score AS company_score,
             COUNT(*) OVER() AS full_count
      FROM personnel p
      LEFT JOIN leads l ON p.company_id = l.id
      ${whereClause}
      ORDER BY p.is_primary_decision_maker DESC, p.created_at DESC
      LIMIT $${i++} OFFSET $${i++}
    `;
    values.push(pageSize, offset);

    const { rows } = await pool.query(sql, values);
    const total = rows.length > 0 ? Number(rows[0].full_count) : 0;
    const totalPages = Math.ceil(total / pageSize);
    const items = rows.map(({ full_count, ...rest }) => rest);

    return NextResponse.json({
      view: "personnel",
      items,
      pagination: { total, page, pageSize, totalPages },
    });
  } catch (err: any) {
    console.error("[API /leads error]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!isNeonConfigured()) {
      return NextResponse.json({ error: "DATABASE_URL is missing" }, { status: 500 });
    }
    const body = await req.json().catch(() => ({}));
    const { ids, view } = body;

    if (!Array.isArray(ids) || !ids.length) {
      return NextResponse.json({ error: "ids array is required" }, { status: 400 });
    }

    const pool = getDbPool();

    if (view === "personnel") {
      const res = await pool.query(`DELETE FROM personnel WHERE id = ANY($1::uuid[])`, [ids]);
      return NextResponse.json({ ok: true, deletedCount: res.rowCount });
    }

    const res = await pool.query(`DELETE FROM leads WHERE id = ANY($1::uuid[])`, [ids]);
    return NextResponse.json({ ok: true, deletedCount: res.rowCount });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
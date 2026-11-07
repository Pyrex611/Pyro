import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { isNeonConfigured } from "@/lib/config";
import { searchMoltsetsPeople, moltsetsLinkedinToBestEmail, moltsetsLinkedinToMobilePhone } from "@/lib/providers/moltsets";
import { runApifyWebsiteContentCrawler } from "@/lib/providers/apify";
import { calculateLeadScore } from "@pyro/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // 60s timeout for live enrichment

export async function POST(req: NextRequest) {
  try {
    if (!isNeonConfigured()) {
      return NextResponse.json({ error: "DATABASE_URL is not configured" }, { status: 500 });
    }

    const pool = getDbPool();
    const body = await req.json();
    const { entityId, entityType, tool } = body;

    if (!entityId || !entityType) {
      return NextResponse.json({ error: "entityId and entityType are required" }, { status: 400 });
    }

    const now = new Date().toISOString();

    // =======================================================================
    // 1. ENRICH COMPANY / PRACTICE
    // =======================================================================
    if (entityType === "company") {
      const companyRes = await pool.query(
        `SELECT id, name, domain, website, phone_e164, email, city, state, signals, custom_fields, score FROM leads WHERE id = $1`,
        [entityId]
      );

      if (!companyRes.rows.length) {
        return NextResponse.json({ error: "Company not found" }, { status: 404 });
      }

      const company = companyRes.rows[0];
      const domain = company.domain || (company.website ? company.website.replace(/^https?:\/\//, "").replace(/\/.*$/, "") : null);

      let discoveredStaff: any[] = [];
      let toolUsed = "moltsets:search_people";

      // Strategy A: If domain exists, search decision makers across MoltSets
      if (domain) {
        console.log(`[ENRICH] Searching decision-makers for domain: ${domain}`);
        const moltsetsRes = await searchMoltsetsPeople({
          company_domain: [domain],
          seniority: ["Owner", "C Suite", "Partner", "VP", "Head", "Director"],
          limit: 10,
        });

        discoveredStaff = moltsetsRes.candidates;
      }

      // Strategy B: If MoltSets yielded 0 staff and website is present, run Apify Website Content Crawler
      if (discoveredStaff.length === 0 && company.website) {
        console.log(`[ENRICH] Running Apify Website Content Crawler on: ${company.website}`);
        toolUsed = "apify:website-crawler";
        const crawlerRes = await runApifyWebsiteContentCrawler({ url: company.website, companyName: company.name });
        discoveredStaff = crawlerRes.candidates;
      }

      // Attach newly discovered staff to personnel table
      let attachedCount = 0;
      for (const staff of discoveredStaff) {
        const dm = staff.decisionMaker;
        if (dm && dm.name && dm.name.length >= 3) {
          const dedupeKey = dm.email
            ? `em:${dm.email.toLowerCase().trim()}`
            : `pn:${company.id}:${dm.name.toLowerCase().replace(/[^a-z0-9]/g, "")}`;

          await pool.query(
            `INSERT INTO personnel (company_id, full_name, title, direct_email, direct_phone, is_primary_decision_maker, dedupe_key)
             VALUES ($1, $2, $3, $4, $5, TRUE, $6)
             ON CONFLICT (dedupe_key) DO UPDATE SET
               direct_email = COALESCE(personnel.direct_email, EXCLUDED.direct_email),
               direct_phone = COALESCE(personnel.direct_phone, EXCLUDED.direct_phone),
               updated_at = NOW()`,
            [company.id, dm.name, dm.title || "Decision Maker", dm.email || null, dm.phone || null, dedupeKey]
          );
          attachedCount++;
        }
      }

      // Recalculate score with new decision-maker details
      const primaryDm = discoveredStaff[0]?.decisionMaker;
      const { score, reasons } = calculateLeadScore({
        name: company.name,
        phone: company.phone_e164,
        email: company.email || primaryDm?.email,
        website: company.website,
        decisionMaker: primaryDm || company.decision_maker,
        signals: company.signals,
      });

      // Update company row with enrichment stamp and refreshed score
      const updatedCompanyRes = await pool.query(
        `UPDATE leads SET
           decision_maker = CASE WHEN $1::jsonb != '{}'::jsonb THEN $1::jsonb ELSE leads.decision_maker END,
           email = COALESCE(leads.email, $2),
           custom_fields = leads.custom_fields || $3::jsonb,
           score = GREATEST(leads.score, $4),
           score_reasons = $5::jsonb,
           updated_at = NOW()
         WHERE id = $6
         RETURNING *`,
        [
          JSON.stringify(primaryDm || {}),
          primaryDm?.email || null,
          JSON.stringify({
            last_enriched_at: now,
            enrichment_tool: toolUsed,
            enrichment_status: "enriched",
            discovered_staff_count: attachedCount,
          }),
          score,
          JSON.stringify(reasons),
          company.id,
        ]
      );

      // Fetch refreshed personnel roster
      const personnelRes = await pool.query(
        `SELECT id, full_name, title, direct_email, direct_phone, email_risk_score, is_primary_decision_maker FROM personnel WHERE company_id = $1`,
        [company.id]
      );

      return NextResponse.json({
        ok: true,
        entityType: "company",
        entity: updatedCompanyRes.rows[0],
        personnel: personnelRes.rows,
        message: `Successfully enriched practice! Discovered and linked ${attachedCount} personnel.`,
      });
    }

    // =======================================================================
    // 2. ENRICH PERSONNEL (DOCTOR / CONTACT)
    // =======================================================================
    const personRes = await pool.query(`SELECT * FROM personnel WHERE id = $1`, [entityId]);
    if (!personRes.rows.length) {
      return NextResponse.json({ error: "Personnel record not found" }, { status: 404 });
    }

    const person = personRes.rows[0];
    let resolvedEmail = person.direct_email;
    let resolvedPhone = person.direct_phone;
    let riskScore = person.email_risk_score;
    let toolUsed = "moltsets:profile_lookup";

    // If LinkedIn URL is on file, resolve direct email
    if (person.linkedin_url) {
      toolUsed = "moltsets:linkedin_to_best_email";
      const liRes = await moltsetsLinkedinToBestEmail(person.linkedin_url);
      if (liRes.candidates[0]?.decisionMaker?.email) {
        resolvedEmail = liRes.candidates[0].decisionMaker.email;
        riskScore = liRes.candidates[0].signals?.find((s: any) => s.type === "email_risk_score")?.value;
      }

      // If mobile tool requested or phone missing, resolve mobile
      if (tool === "mobile" || !resolvedPhone) {
        const mobRes = await moltsetsLinkedinToMobilePhone(person.linkedin_url);
        if (mobRes.candidates[0]?.decisionMaker?.phone) {
          resolvedPhone = mobRes.candidates[0].decisionMaker.phone;
        }
      }
    }

    // Stamp enrichment details
    const updatedPersonRes = await pool.query(
      `UPDATE personnel SET
         direct_email = COALESCE($1, direct_email),
         direct_phone = COALESCE($2, direct_phone),
         email_risk_score = COALESCE($3, email_risk_score),
         signals = personnel.signals || $4::jsonb,
         updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [
        resolvedEmail,
        resolvedPhone,
        riskScore,
        JSON.stringify([
          { type: "last_enriched_at", value: now },
          { type: "enrichment_tool", value: toolUsed },
        ]),
        person.id,
      ]
    );

    return NextResponse.json({
      ok: true,
      entityType: "personnel",
      entity: updatedPersonRes.rows[0],
      message: "Successfully resolved contact channels for this person!",
    });
  } catch (err: any) {
    console.error("[ENRICH API ERROR]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
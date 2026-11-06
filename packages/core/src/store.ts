import pg from "pg";
const { Pool } = pg;
import { generateDedupeKey } from "./dedupe";
import { calculateLeadScore } from "./scoring";
import { normalizeDomain, normalizePhone } from "./normalize";
import type { LeadCandidate, RawRecord } from "./types";

export class NeonStore {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  }

  /**
   * Creates a queued run row in Neon
   */
  async createRun(sourceId: string, input: unknown): Promise<string> {
    const res = await this.pool.query(
      `INSERT INTO runs (source_id, input, status, created_at)
       VALUES ($1, $2, 'queued', NOW()) RETURNING id`,
      [sourceId, JSON.stringify(input)]
    );
    return res.rows[0].id;
  }

  /**
   * Updates run execution status, record counters, and timestamps
   */
  async updateRunStatus(
    runId: string,
    patch: {
      status?: "queued" | "running" | "normalizing" | "deduping" | "succeeded" | "failed" | "canceled";
      recordsRaw?: number;
      recordsDeduped?: number;
      error?: string | null;
    }
  ): Promise<void> {
    const sets: string[] = [];
    const vals: unknown[] = [runId];
    let i = 2;

    if (patch.status) {
      sets.push(`status = $${i++}`);
      vals.push(patch.status);
      if (patch.status === "running") sets.push(`started_at = NOW()`);
      if (patch.status === "succeeded" || patch.status === "failed" || patch.status === "canceled") {
        sets.push(`finished_at = NOW()`);
      }
    }
    if (patch.recordsRaw !== undefined) {
      sets.push(`records_raw = $${i++}`);
      vals.push(patch.recordsRaw);
    }
    if (patch.recordsDeduped !== undefined) {
      sets.push(`records_deduped = $${i++}`);
      vals.push(patch.recordsDeduped);
    }
    if (patch.error !== undefined) {
      sets.push(`error = $${i++}`);
      vals.push(patch.error);
    }
    sets.push(`heartbeat_at = NOW()`);

    await this.pool.query(`UPDATE runs SET ${sets.join(", ")} WHERE id = $1`, vals);
  }

  /**
   * Atomically ingests batches of raw records, dedupes against existing practices,
   * merges new attributes non-destructively, attributes personnel, and records run provenance.
   */
  async ingestBatch(
    runId: string,
    sourceId: string,
    candidates: { raw: RawRecord; candidate: LeadCandidate }[]
  ): Promise<number> {
    let dedupedCount = 0;
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      // 1. Check for custom field mappings configured for this source
      let savedMappings: Record<string, string> = {};
      try {
        const mapRes = await client.query(
          `SELECT mappings FROM source_field_mappings WHERE source_id = $1`,
          [sourceId]
        );
        if (mapRes.rows.length) savedMappings = mapRes.rows[0].mappings || {};
      } catch {}

      for (const { raw, candidate } of candidates) {
        // 2. Persist immutable raw record
        await client.query(
          `INSERT INTO raw_records (run_id, source_id, source_ref, payload)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (run_id, source_id, source_ref) DO NOTHING`,
          [runId, sourceId, raw.sourceRef, JSON.stringify(raw.payload)]
        );

        // 3. Apply custom dynamic field mappings
        const customFields: Record<string, any> = {};
        const payload = raw.payload as Record<string, any>;
        for (const [rawKey, targetField] of Object.entries(savedMappings)) {
          if (payload[rawKey] !== undefined) {
            if (targetField.startsWith("custom:")) {
              customFields[targetField.replace("custom:", "")] = payload[rawKey];
            } else if (targetField === "name" && !candidate.name) {
              candidate.name = String(payload[rawKey]);
            } else if (targetField === "website" && !candidate.website) {
              candidate.website = String(payload[rawKey]);
            } else if (targetField === "phone" && !candidate.phone) {
              candidate.phone = String(payload[rawKey]);
            } else if (targetField === "email" && !candidate.email) {
              candidate.email = String(payload[rawKey]);
            }
          }
        }

        const domain = candidate.website ? normalizeDomain(candidate.website) : null;
        const phone = candidate.phone ? normalizePhone(candidate.phone) : null;
        const rawName = candidate.name.trim();
        const normName = rawName.toLowerCase().replace(/[^a-z0-9]/g, "");
        const city = candidate.city?.trim() || "";
        const state = candidate.state?.trim() || "";

        // 4. THREE-WAY DEDUPE LOOKUP
        // Priority 1: Match on Domain or Phone
        // Priority 2: Match on Name + Location (Same City/State)
        const matchRes = await client.query(
          `SELECT id, name, domain, phone_e164, email, website, city, state, signals, custom_fields, score
           FROM leads
           WHERE (domain IS NOT NULL AND domain = $1)
              OR (phone_e164 IS NOT NULL AND phone_e164 = $2)
              OR (LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '', 'g')) = $3
                  AND (($4 != '' AND LOWER(city) = LOWER($4)) OR ($5 != '' AND LOWER(state) = LOWER($5))))
           LIMIT 1`,
          [domain, phone, normName, city, state]
        );

        let leadId: string;

        if (matchRes.rows.length > 0) {
          // --- EXISTING ENTITY FOUND: EVALUATE MERGE VS DISCARD ---
          const existing = matchRes.rows[0];

          const hasNewPhone = Boolean(phone && !existing.phone_e164);
          const hasNewEmail = Boolean(candidate.email && !existing.email);
          const hasNewWebsite = Boolean(domain && !existing.domain);
          const hasNewDm = Boolean(candidate.decisionMaker?.name);
          const hasNewSignals = Boolean(candidate.signals?.length > 0);

          if (!hasNewPhone && !hasNewEmail && !hasNewWebsite && !hasNewDm && !hasNewSignals) {
            // RULE 1: IDENTICAL DUPLICATE -> Discard row creation (Zero database bloat)
            leadId = existing.id;
          } else {
            // RULE 2: PARTIAL MATCH WITH NEW DETAILS -> MERGE NON-DESTRUCTIVELY
            const { score, reasons } = calculateLeadScore({
              ...candidate,
              phone: candidate.phone || existing.phone_e164,
              email: candidate.email || existing.email,
              website: candidate.website || existing.website,
            });

            const mergedRes = await client.query(
              `UPDATE leads SET
                 phone_e164 = COALESCE(leads.phone_e164, $1),
                 email = COALESCE(leads.email, $2),
                 website = COALESCE(leads.website, $3),
                 domain = COALESCE(leads.domain, $4),
                 decision_maker = CASE WHEN $5::jsonb != '{}'::jsonb THEN $5::jsonb ELSE leads.decision_maker END,
                 signals = leads.signals || $6::jsonb,
                 score = GREATEST(leads.score, $7),
                 score_reasons = CASE WHEN $7 > leads.score THEN $8::jsonb ELSE leads.score_reasons END,
                 updated_at = NOW()
               WHERE id = $9
               RETURNING id`,
              [
                phone,
                candidate.email || null,
                candidate.website || null,
                domain,
                JSON.stringify(candidate.decisionMaker || {}),
                JSON.stringify(candidate.signals || []),
                score,
                JSON.stringify(reasons),
                existing.id,
              ]
            );
            leadId = mergedRes.rows[0].id;
            dedupedCount++;
          }
        } else {
          // --- RULE 3: DISTINCT PRACTICE -> INSERT UNIQUE ---
          const dedupeKey = generateDedupeKey(candidate);
          const { score, reasons } = calculateLeadScore(candidate);

          const insRes = await client.query(
            `INSERT INTO leads (
              name, niche, phone_e164, email, website, domain, address, city, state, zip,
              lat, lng, npi, decision_maker, signals, score, score_reasons, dedupe_key, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
            ON CONFLICT (dedupe_key) DO UPDATE SET
              email = COALESCE(leads.email, EXCLUDED.email),
              phone_e164 = COALESCE(leads.phone_e164, EXCLUDED.phone_e164),
              website = COALESCE(leads.website, EXCLUDED.website),
              domain = COALESCE(leads.domain, EXCLUDED.domain),
              updated_at = NOW()
            RETURNING id`,
            [
              rawName,
              candidate.niche,
              phone,
              candidate.email ?? null,
              candidate.website ?? null,
              domain,
              candidate.address ?? null,
              candidate.city ?? null,
              candidate.state ?? null,
              candidate.zip ?? null,
              candidate.lat ?? null,
              candidate.lng ?? null,
              candidate.npi ?? null,
              JSON.stringify(candidate.decisionMaker ?? {}),
              JSON.stringify(candidate.signals ?? []),
              score,
              JSON.stringify(reasons),
              dedupeKey,
            ]
          );
          leadId = insRes.rows[0].id;
          dedupedCount++;

          // Populate auxiliary companies table
          try {
            await client.query(
              `INSERT INTO companies (name, niche, domain, website, general_phone, general_email, address, city, state, zip, commercial_score, dedupe_key)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
               ON CONFLICT (dedupe_key) DO NOTHING`,
              [rawName, candidate.niche, domain, candidate.website || null, phone, candidate.email || null, candidate.address || null, candidate.city || null, candidate.state || null, candidate.zip || null, score, dedupeKey]
            );
          } catch {}
        }

        // 5. Upsert Personnel WITH Direct run_id Attribution
        const dm = candidate.decisionMaker;
        if (dm && typeof dm.name === "string" && dm.name.trim().length >= 3) {
          try {
            const personName = dm.name.trim();
            const personEmail = typeof dm.email === "string" && dm.email.includes("@") ? dm.email.toLowerCase().trim() : null;
            const personDedupeKey = personEmail
              ? `em:${personEmail}`
              : `pn:${leadId}:${personName.toLowerCase().replace(/[^a-z0-9]/g, "")}`;

            await client.query(
              `INSERT INTO personnel (company_id, full_name, title, direct_email, direct_phone, dedupe_key, is_primary_decision_maker, run_id)
               VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7)
               ON CONFLICT (dedupe_key) DO UPDATE SET
                 company_id = EXCLUDED.company_id,
                 run_id = COALESCE(EXCLUDED.run_id, personnel.run_id),
                 direct_phone = COALESCE(personnel.direct_phone, EXCLUDED.direct_phone),
                 direct_email = COALESCE(personnel.direct_email, EXCLUDED.direct_email),
                 title = COALESCE(EXCLUDED.title, personnel.title)`,
              [leadId, personName, dm.title || "Decision Maker", personEmail, dm.phone || null, personDedupeKey, runId]
            );
          } catch (e: any) {
            console.error("[PERSONNEL INSERT ERROR]:", e.message);
          }
        }

        // 6. Record Source Provenance WITH Direct run_id Attribution
        await client.query(
          `INSERT INTO lead_sources (lead_id, source_id, source_ref, confidence_tier, fields_provided, run_id)
           VALUES ($1, $2, $3, 'MEDIUM', $4, $5)
           ON CONFLICT (lead_id, source_id, source_ref) DO UPDATE SET run_id = EXCLUDED.run_id`,
          [leadId, sourceId, raw.sourceRef, JSON.stringify(Object.keys(candidate)), runId]
        );
      }

      await client.query("COMMIT");
      return dedupedCount;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
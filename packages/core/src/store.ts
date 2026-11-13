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

  async createRun(sourceId: string, input: unknown): Promise<string> {
    const res = await this.pool.query(
      `INSERT INTO runs (source_id, input, status, created_at)
       VALUES ($1, $2, 'queued', NOW()) RETURNING id`,
      [sourceId, JSON.stringify(input)]
    );
    return res.rows[0].id;
  }

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
   * SET-BASED BULK INGESTION CTE (Atomic Single-Trip with Intra-Batch Deduplication)
   * Resolves intra-batch duplicate key collisions using window functions before upserting.
   */
  async ingestBatch(
    runId: string,
    sourceId: string,
    candidates: { raw: RawRecord; candidate: LeadCandidate }[]
  ): Promise<number> {
    if (!candidates.length) return 0;
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      // 1. Fetch dynamic source field mappings
      let savedMappings: Record<string, string> = {};
      try {
        const mapRes = await client.query(
          `SELECT mappings FROM source_field_mappings WHERE source_id = $1`,
          [sourceId]
        );
        if (mapRes.rows.length) savedMappings = mapRes.rows[0].mappings || {};
      } catch {}

      // 2. Prepare structured JSON array with strict lexical type narrowing
      const preparedBatch = candidates.map(({ raw, candidate }) => {
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
        const dedupeKey = generateDedupeKey(candidate);
        const { score, reasons } = calculateLeadScore(candidate);

        const dm = candidate.decisionMaker;
        const rawDmName = dm && typeof dm.name === "string" ? dm.name.trim() : "";
        const hasValidDm = rawDmName.length >= 3;
        const dmName = hasValidDm ? rawDmName : null;
        const dmTitle = dm?.title && typeof dm.title === "string" ? dm.title.trim() : "Decision Maker";
        const dmEmail = dm?.email && typeof dm.email === "string" && dm.email.includes("@") ? dm.email.toLowerCase().trim() : null;
        const dmPhone = dm?.phone && typeof dm.phone === "string" ? dm.phone.trim() : null;

        return {
          sourceId,
          sourceRef: raw.sourceRef,
          rawPayload: raw.payload,
          name: candidate.name.trim(),
          niche: candidate.niche || "Healthcare",
          phone,
          email: candidate.email?.trim() || null,
          website: candidate.website || null,
          domain,
          address: candidate.address || null,
          city: candidate.city || null,
          state: candidate.state || null,
          zip: candidate.zip || null,
          signals: candidate.signals || [],
          score,
          scoreReasons: reasons,
          dedupeKey,
          customFields,
          hasDm: hasValidDm,
          dmName,
          dmTitle,
          dmEmail,
          dmPhone,
        };
      });

      // 3. EXECUTE SET-BASED CTE WITH INTRA-BATCH DEDUPLICATION
      const bulkSql = `
        WITH raw_input AS (
          SELECT * FROM jsonb_to_recordset($1::jsonb) AS (
            "sourceId" TEXT, "sourceRef" TEXT, "rawPayload" JSONB,
            "name" TEXT, "niche" TEXT, "phone" TEXT, "email" TEXT, "website" TEXT,
            "domain" TEXT, "address" TEXT, "city" TEXT, "state" TEXT, "zip" TEXT,
            "signals" JSONB, "score" INT, "scoreReasons" JSONB, "dedupeKey" TEXT, "customFields" JSONB,
            "hasDm" BOOLEAN, "dmName" TEXT, "dmTitle" TEXT, "dmEmail" TEXT, "dmPhone" TEXT
          )
        ),
        -- Step A: Deduplicate raw records by (sourceId, sourceRef)
        distinct_raw AS (
          SELECT * FROM (
            SELECT *,
                   ROW_NUMBER() OVER (
                     PARTITION BY "sourceId", "sourceRef" 
                     ORDER BY 1
                   ) as rn
            FROM raw_input
          ) sub
          WHERE rn = 1
        ),
        inserted_raw AS (
          INSERT INTO raw_records (run_id, source_id, source_ref, payload)
          SELECT $2, "sourceId", "sourceRef", "rawPayload" FROM distinct_raw
          ON CONFLICT (run_id, source_id, source_ref) DO NOTHING
        ),
        -- Step B: Intra-Batch Deduplication for Leads (Prevents ON CONFLICT DO UPDATE twice in same query)
        distinct_leads AS (
          SELECT * FROM (
            SELECT *,
                   ROW_NUMBER() OVER (
                     PARTITION BY "dedupeKey" 
                     ORDER BY ("phone" IS NOT NULL) DESC, ("email" IS NOT NULL) DESC, "score" DESC
                   ) as rn
            FROM raw_input
          ) sub
          WHERE rn = 1
        ),
        upserted_leads AS (
          INSERT INTO leads (
            name, niche, phone_e164, email, website, domain, address, city, state, zip,
            signals, score, score_reasons, dedupe_key, custom_fields, updated_at
          )
          SELECT 
            "name", "niche", "phone", "email", "website", "domain", "address", "city", "state", "zip",
            "signals", "score", "scoreReasons", "dedupeKey", "customFields", NOW()
          FROM distinct_leads
          ON CONFLICT (dedupe_key) DO UPDATE SET
            phone_e164 = COALESCE(leads.phone_e164, EXCLUDED.phone_e164),
            email = COALESCE(leads.email, EXCLUDED.email),
            website = COALESCE(leads.website, EXCLUDED.website),
            domain = COALESCE(leads.domain, EXCLUDED.domain),
            signals = leads.signals || EXCLUDED.signals,
            custom_fields = leads.custom_fields || EXCLUDED.custom_fields,
            score = GREATEST(leads.score, EXCLUDED.score),
            score_reasons = CASE WHEN EXCLUDED.score > leads.score THEN EXCLUDED.score_reasons ELSE leads.score_reasons END,
            updated_at = NOW()
          RETURNING id, dedupe_key
        ),
        -- Step C: Deduplicate lead_sources by (lead_id, sourceId, sourceRef)
        distinct_lead_sources AS (
          SELECT * FROM (
            SELECT ul.id as lead_id, ri."sourceId", ri."sourceRef",
                   ROW_NUMBER() OVER (
                     PARTITION BY ul.id, ri."sourceId", ri."sourceRef" 
                     ORDER BY 1
                   ) as rn
            FROM raw_input ri
            JOIN upserted_leads ul ON ri."dedupeKey" = ul.dedupe_key
          ) sub
          WHERE rn = 1
        ),
        linked_sources AS (
          INSERT INTO lead_sources (lead_id, source_id, source_ref, confidence_tier, run_id)
          SELECT lead_id, "sourceId", "sourceRef", 'MEDIUM', $2
          FROM distinct_lead_sources
          ON CONFLICT (lead_id, source_id, source_ref) DO UPDATE SET run_id = EXCLUDED.run_id
        ),
        -- Step D: Intra-Batch Deduplication for Personnel (Preserves all unique doctors across clinics)
        distinct_personnel AS (
          SELECT * FROM (
            SELECT 
              ul.id as company_id, 
              ri."dmName" as full_name, 
              COALESCE(ri."dmTitle", 'Decision Maker') as title, 
              ri."dmEmail" as direct_email, 
              ri."dmPhone" as direct_phone,
              CASE 
                WHEN ri."dmEmail" IS NOT NULL AND ri."dmEmail" != '' THEN 'em:' || LOWER(ri."dmEmail") 
                ELSE 'pn:' || ul.id || ':' || LOWER(REGEXP_REPLACE(ri."dmName", '[^a-z0-9]', '', 'g')) 
              END as dedupe_key,
              ROW_NUMBER() OVER (
                PARTITION BY CASE 
                  WHEN ri."dmEmail" IS NOT NULL AND ri."dmEmail" != '' THEN 'em:' || LOWER(ri."dmEmail") 
                  ELSE 'pn:' || ul.id || ':' || LOWER(REGEXP_REPLACE(ri."dmName", '[^a-z0-9]', '', 'g')) 
                END
                ORDER BY (ri."dmEmail" IS NOT NULL) DESC
              ) as rn
            FROM raw_input ri
            JOIN upserted_leads ul ON ri."dedupeKey" = ul.dedupe_key
            WHERE ri."hasDm" = TRUE AND ri."dmName" IS NOT NULL AND length(trim(ri."dmName")) >= 3
          ) sub
          WHERE rn = 1
        )
        INSERT INTO personnel (company_id, full_name, title, direct_email, direct_phone, dedupe_key, is_primary_decision_maker, run_id)
        SELECT company_id, full_name, title, direct_email, direct_phone, dedupe_key, TRUE, $2
        FROM distinct_personnel
        ON CONFLICT (dedupe_key) DO UPDATE SET
          direct_email = COALESCE(personnel.direct_email, EXCLUDED.direct_email),
          direct_phone = COALESCE(personnel.direct_phone, EXCLUDED.direct_phone),
          run_id = COALESCE(EXCLUDED.run_id, personnel.run_id),
          updated_at = NOW();
      `;

      await client.query(bulkSql, [JSON.stringify(preparedBatch), runId]);
      await client.query("COMMIT");

      return candidates.length;
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
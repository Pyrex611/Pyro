import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import dns from "node:dns";
import { Resolver } from "node:dns/promises";
import pg from "pg";
const { Pool } = pg;

if (dns.setDefaultResultOrder) dns.setDefaultResultOrder("ipv4first");
const resolver = new Resolver();
resolver.setServers(["8.8.8.8", "1.1.1.1"]);

function loadEnv() {
  const paths = [
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), "apps", "web", ".env.local"),
    resolve(process.cwd(), ".env"),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      const text = readFileSync(p, "utf8");
      for (const line of text.split(/\r?\n/)) {
        const [k, ...v] = line.split("=");
        if (k && v.length && !process.env[k.trim()]) {
          process.env[k.trim()] = v.join("=").trim().replace(/['"]/g, "");
        }
      }
    }
  }
}
loadEnv();

let conn = process.env.DATABASE_URL;
if (!conn) { console.error("DATABASE_URL missing"); process.exit(1); }
if (conn.includes("-pooler")) conn = conn.replace("-pooler", "");

const pool = new Pool({
  connectionString: conn,
  ssl: { rejectUnauthorized: false },
  lookup: async (hostname, options, cb) => {
    try {
      const addrs = await resolver.resolve4(hostname);
      if (addrs.length) return cb(null, addrs[0], 4);
    } catch {}
    dns.lookup(hostname, options, cb);
  },
});

async function run() {
  const client = await pool.connect();
  try {
    console.log("[CLEANUP] Adding run_id to personnel and merging duplicate leads...");
    await client.query("BEGIN");

    // 1. Add run_id to personnel if missing
    await client.query(`
      ALTER TABLE personnel 
      ADD COLUMN IF NOT EXISTS run_id UUID REFERENCES runs(id) ON DELETE CASCADE
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_personnel_run ON personnel(run_id)`);

    // 2. Add run_id to lead_sources if missing
    await client.query(`
      ALTER TABLE lead_sources 
      ADD COLUMN IF NOT EXISTS run_id UUID REFERENCES runs(id) ON DELETE CASCADE
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lead_sources_run ON lead_sources(run_id)`);

    // 3. Backfill run_id on lead_sources from raw_records
    await client.query(`
      UPDATE lead_sources ls
      SET run_id = rr.run_id
      FROM raw_records rr
      WHERE (ls.source_ref = rr.source_ref OR ls.source_id = rr.source_id)
        AND ls.run_id IS NULL
    `);

    // 4. Backfill personnel.run_id from lead_sources
    await client.query(`
      UPDATE personnel p
      SET run_id = ls.run_id
      FROM lead_sources ls
      WHERE p.company_id = ls.lead_id AND p.run_id IS NULL AND ls.run_id IS NOT NULL
    `);

    // 5. Find all duplicate leads grouped by normalized name
    const dupsRes = await client.query(`
      SELECT LOWER(REGEXP_REPLACE(trim(name), '[^a-zA-Z0-9]', '', 'g')) as norm_name, array_agg(id ORDER BY created_at ASC) as ids
      FROM leads
      WHERE name IS NOT NULL AND length(trim(name)) >= 3
      GROUP BY LOWER(REGEXP_REPLACE(trim(name), '[^a-zA-Z0-9]', '', 'g'))
      HAVING count(*) > 1
    `);

    let mergedCount = 0;
    for (const row of dupsRes.rows) {
      const [primaryId, ...duplicateIds] = row.ids;
      const allGroupIds = [primaryId, ...duplicateIds];

      // --- STEP A: DEDUPLICATE PERSONNEL VIA ROW_NUMBER ---
      // Keeps at most 1 personnel per dedupe_key across the group, prioritizing primaryId
      await client.query(`
        WITH ranked AS (
          SELECT id,
                 ROW_NUMBER() OVER (
                   PARTITION BY dedupe_key 
                   ORDER BY (company_id = $1) DESC, created_at ASC, id ASC
                 ) as rn
          FROM personnel
          WHERE company_id = ANY($2::uuid[])
        )
        DELETE FROM personnel
        WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
      `, [primaryId, allGroupIds]);

      // Repoint remaining personnel to primaryId
      await client.query(`
        UPDATE personnel 
        SET company_id = $1 
        WHERE company_id = ANY($2::uuid[]) AND company_id != $1
      `, [primaryId, allGroupIds]);

      // --- STEP B: DEDUPLICATE LEAD_SOURCES VIA ROW_NUMBER ---
      // Keeps at most 1 row per (source_id, source_ref) across the group, prioritizing primaryId
      await client.query(`
        WITH ranked AS (
          SELECT id,
                 ROW_NUMBER() OVER (
                   PARTITION BY source_id, source_ref 
                   ORDER BY (lead_id = $1) DESC, id ASC
                 ) as rn
          FROM lead_sources
          WHERE lead_id = ANY($2::uuid[])
        )
        DELETE FROM lead_sources
        WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
      `, [primaryId, allGroupIds]);

      // Repoint remaining lead_sources to primaryId (guaranteed collision-free!)
      await client.query(`
        UPDATE lead_sources 
        SET lead_id = $1 
        WHERE lead_id = ANY($2::uuid[]) AND lead_id != $1
      `, [primaryId, allGroupIds]);

      // --- STEP C: DELETE REDUNDANT DUPLICATE LEADS ---
      await client.query(`
        DELETE FROM leads 
        WHERE id = ANY($1::uuid[])
      `, [duplicateIds]);

      mergedCount += duplicateIds.length;
    }

    // 6. Backfill any existing decision_makers from leads into personnel table
    const leadsWithDmRes = await client.query(`
      SELECT DISTINCT ON (l.id) l.id, l.name, l.decision_maker, ls.run_id
      FROM leads l
      LEFT JOIN lead_sources ls ON l.id = ls.lead_id
      WHERE l.decision_maker IS NOT NULL 
        AND l.decision_maker != '{}'::jsonb
        AND NOT EXISTS (
          SELECT 1 FROM personnel p WHERE p.company_id = l.id
        )
      ORDER BY l.id, ls.run_id NULLS LAST
    `);

    let backfilledDmCount = 0;
    for (const row of leadsWithDmRes.rows) {
      const dm = row.decision_maker;
      const dmName = dm.name?.trim();
      const dmTitle = dm.title?.trim();
      const dmEmail = dm.email?.trim()?.toLowerCase();
      const dmPhone = dm.phone?.trim();

      if ((dmName && dmName.length >= 3) || (dmTitle && dmTitle.length >= 3) || dmEmail) {
        const resolvedName = dmName || `${row.name} Contact`;
        const resolvedTitle = dmTitle || "Decision Maker";
        const dedupeKey = dmEmail ? `em:${dmEmail}` : `pn:${row.id}:${resolvedName.toLowerCase().replace(/[^a-z0-9]/g, "")}`;

        await client.query(`
          INSERT INTO personnel (company_id, full_name, title, direct_email, direct_phone, is_primary_decision_maker, dedupe_key, run_id)
          VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7)
          ON CONFLICT (dedupe_key) DO UPDATE SET
            company_id = EXCLUDED.company_id,
            run_id = COALESCE(EXCLUDED.run_id, personnel.run_id),
            title = COALESCE(EXCLUDED.title, personnel.title),
            direct_email = COALESCE(EXCLUDED.direct_email, personnel.direct_email),
            direct_phone = COALESCE(EXCLUDED.direct_phone, personnel.direct_phone)
        `, [row.id, resolvedName, resolvedTitle, dmEmail || null, dmPhone || null, dedupeKey, row.run_id || null]);
        backfilledDmCount++;
      }
    }

    await client.query("COMMIT");
    console.log(`[CLEANUP] Success! Merged ${mergedCount} duplicate leads and backfilled ${backfilledDmCount} personnel with run attribution.`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[CLEANUP] Failed:", e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
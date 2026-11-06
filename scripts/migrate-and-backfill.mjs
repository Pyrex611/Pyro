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
    console.log("[MIGRATE] Updating schema and backfilling personnel...");
    await client.query("BEGIN");

    // 1. Fix personnel foreign key to point directly to leads(id)
    await client.query(`
      ALTER TABLE personnel 
      DROP CONSTRAINT IF EXISTS personnel_company_id_fkey
    `);
    await client.query(`
      ALTER TABLE personnel 
      ADD CONSTRAINT personnel_company_id_fkey 
      FOREIGN KEY (company_id) REFERENCES leads(id) ON DELETE CASCADE
    `);

    // 2. Add run_id column to lead_sources for fast, reliable run scoping
    await client.query(`
      ALTER TABLE lead_sources 
      ADD COLUMN IF NOT EXISTS run_id UUID REFERENCES runs(id) ON DELETE CASCADE
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_lead_sources_run ON lead_sources(run_id)
    `);

    // 3. Backfill lead_sources.run_id from raw_records
    await client.query(`
      UPDATE lead_sources ls
      SET run_id = rr.run_id
      FROM raw_records rr
      WHERE (ls.source_ref = rr.source_ref OR ls.source_id = rr.source_id)
        AND ls.run_id IS NULL
    `);

    // 4. Backfill all existing leads' decision_makers into the personnel table
    const leadsRes = await client.query(`
      SELECT id, name, decision_maker 
      FROM leads 
      WHERE decision_maker IS NOT NULL 
        AND decision_maker != '{}'::jsonb
    `);

    let backfilledCount = 0;
    for (const row of leadsRes.rows) {
      const dm = row.decision_maker;
      const dmName = dm.name?.trim();
      const dmTitle = dm.title?.trim();
      const dmEmail = dm.email?.trim()?.toLowerCase();
      const dmPhone = dm.phone?.trim();

      if ((dmName && dmName.length >= 3) || (dmTitle && dmTitle.length >= 3) || dmEmail) {
        const resolvedName = dmName || `${row.name} Contact`;
        const resolvedTitle = dmTitle || "Decision Maker";
        const dedupeKey = dmEmail ? `em:${dmEmail}` : `pn:${row.id}:${resolvedName.toLowerCase().replace(/[^a-z0-9]/g, "")}`;

        await client.query(
          `INSERT INTO personnel (company_id, full_name, title, direct_email, direct_phone, is_primary_decision_maker, dedupe_key)
           VALUES ($1, $2, $3, $4, $5, TRUE, $6)
           ON CONFLICT (dedupe_key) DO UPDATE SET
             company_id = EXCLUDED.company_id,
             title = COALESCE(EXCLUDED.title, personnel.title),
             direct_email = COALESCE(EXCLUDED.direct_email, personnel.direct_email),
             direct_phone = COALESCE(EXCLUDED.direct_phone, personnel.direct_phone)`,
          [row.id, resolvedName, resolvedTitle, dmEmail || null, dmPhone || null, dedupeKey]
        );
        backfilledCount++;
      }
    }

    await client.query("COMMIT");
    console.log(`[MIGRATE] Success! Linked personnel table to leads and backfilled ${backfilledCount} decision-makers!`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[MIGRATE] Failed:", e);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
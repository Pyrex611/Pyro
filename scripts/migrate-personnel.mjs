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
    console.log("[MIGRATE] Creating companies and personnel relational tables...");
    await client.query("BEGIN");

    // 1. Companies / Clinics Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        niche TEXT NOT NULL,
        domain TEXT,
        website TEXT,
        general_phone TEXT,
        general_email TEXT,
        address TEXT,
        city TEXT,
        state TEXT,
        zip TEXT,
        lat DOUBLE PRECISION,
        lng DOUBLE PRECISION,
        commercial_score INT NOT NULL DEFAULT 50,
        score_reasons JSONB NOT NULL DEFAULT '[]',
        signals JSONB NOT NULL DEFAULT '[]',
        custom_fields JSONB NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'new',
        dedupe_key TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_companies_domain ON companies(domain) WHERE domain IS NOT NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_companies_score ON companies(commercial_score DESC)`);

    // 2. Personnel / Contacts Table (1-to-N with companies)
    await client.query(`
      CREATE TABLE IF NOT EXISTS personnel (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        full_name TEXT NOT NULL,
        first_name TEXT,
        last_name TEXT,
        title TEXT,
        seniority TEXT,
        direct_email TEXT,
        email_risk_score TEXT,
        direct_phone TEXT,
        linkedin_url TEXT,
        is_primary_decision_maker BOOLEAN NOT NULL DEFAULT FALSE,
        signals JSONB NOT NULL DEFAULT '[]',
        dedupe_key TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_personnel_company ON personnel(company_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_personnel_email ON personnel(direct_email) WHERE direct_email IS NOT NULL`);

    await client.query("COMMIT");
    console.log("[MIGRATE] Successfully established Company <-> Personnel relational architecture!");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[MIGRATE] Failed:", e);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
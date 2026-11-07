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
    console.log("[MIGRATE] Creating pipeline_stages table for server-side workflow transfers...");
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS pipeline_stages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        target_provider TEXT NOT NULL,
        target_tool TEXT NOT NULL,
        payload JSONB NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pipeline_stages_expiry ON pipeline_stages(expires_at)
    `);

    await client.query("COMMIT");
    console.log("[MIGRATE] Success! pipeline_stages table deployed with 24h TTL index.");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[MIGRATE] Failed:", e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
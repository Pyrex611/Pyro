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
    console.log("[MIGRATE] Adding source_field_mappings table and custom_fields column...");
    await client.query("BEGIN");

    // 1. Add custom_fields to leads
    await client.query(`
      ALTER TABLE leads 
      ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leads_custom_fields ON leads USING gin (custom_fields)
    `);

    // 2. Create source_field_mappings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS source_field_mappings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_id TEXT NOT NULL UNIQUE,
        mappings JSONB NOT NULL DEFAULT '{}',
        custom_definitions JSONB NOT NULL DEFAULT '[]',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query("COMMIT");
    console.log("[MIGRATE] Successfully updated schema with field mappings & custom fields!");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[MIGRATE] Failed:", e);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
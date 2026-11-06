import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import dns from "node:dns";
import { Resolver } from "node:dns/promises";
import pg from "pg";
const { Pool } = pg;

// 1. Force Node.js to prioritize IPv4 to prevent Windows IPv6 DNS timeouts
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder("ipv4first");
}

// 2. Anycast DNS Resolver (Google & Cloudflare) to bypass local ISP DNS failures
const customResolver = new Resolver();
customResolver.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);

async function customLookup(hostname, options, callback) {
  try {
    const addresses = await customResolver.resolve4(hostname);
    if (addresses && addresses.length > 0) {
      return callback(null, addresses[0], 4);
    }
  } catch (err) {
    // If custom resolver fails, fall back to system lookup
  }
  dns.lookup(hostname, options, callback);
}

// 3. Environment Loader
function loadEnv() {
  if (process.env.DATABASE_URL) return;

  const candidatePaths = [
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "apps", "web", ".env.local"),
    resolve(process.cwd(), "apps", "web", ".env"),
  ];

  for (const envPath of candidatePaths) {
    if (existsSync(envPath)) {
      try {
        const content = readFileSync(envPath, "utf8");
        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            // Strip any hidden Windows \r
            val = val.replace(/\r/g, "");
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
        if (process.env.DATABASE_URL) {
          console.log(`[ENV] Loaded DATABASE_URL from: ${envPath}`);
          return;
        }
      } catch (err) {
        console.warn(`[ENV] Could not read ${envPath}:`, err.message);
      }
    }
  }
}

loadEnv();

let connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("\nFATAL: DATABASE_URL is not set.");
  process.exit(1);
}

// Neon Best Practice: Migrations should use Direct connection (remove -pooler)
if (connectionString.includes("-pooler")) {
  console.log("[NEON MIGRATE] Switching from Pooled to Direct connection for DDL migrations...");
  connectionString = connectionString.replace("-pooler", "");
}

// Silence the pg sslmode=require warning
const parsedUrl = new URL(connectionString);
if (parsedUrl.searchParams.get("sslmode") === "require" && !parsedUrl.searchParams.has("uselibpqcompat")) {
  parsedUrl.searchParams.set("uselibpqcompat", "true");
  connectionString = parsedUrl.toString();
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  lookup: customLookup, // Bypasses local ISP DNS failures
});

async function runMigration() {
  console.log(`[NEON MIGRATE] Connecting to Neon Postgres (${parsedUrl.hostname})...`);
  const client = await pool.connect();
  try {
    const sqlPath = join(process.cwd(), "migrations", "0001_neon_init.sql");
    if (!existsSync(sqlPath)) {
      throw new Error(`Migration file not found at ${sqlPath}`);
    }
    const ddl = readFileSync(sqlPath, "utf8");
    console.log("[NEON MIGRATE] Executing migrations/0001_neon_init.sql...");
    await client.query("BEGIN");
    await client.query(ddl);
    await client.query("COMMIT");
    console.log("[NEON MIGRATE] Schema successfully created with all tables and indexes!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[NEON MIGRATE] Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
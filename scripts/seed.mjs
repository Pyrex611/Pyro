import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import dns from "node:dns";
import { Resolver } from "node:dns/promises";
import pg from "pg";
const { Pool } = pg;

if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder("ipv4first");
}

const customResolver = new Resolver();
customResolver.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);

async function customLookup(hostname, options, callback) {
  try {
    const addresses = await customResolver.resolve4(hostname);
    if (addresses && addresses.length > 0) {
      return callback(null, addresses[0], 4);
    }
  } catch (err) {}
  dns.lookup(hostname, options, callback);
}

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
      } catch (err) {}
    }
  }
}

loadEnv();

let connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("FATAL: DATABASE_URL is not set.");
  process.exit(1);
}

// Use Direct endpoint for seeding
if (connectionString.includes("-pooler")) {
  connectionString = connectionString.replace("-pooler", "");
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  lookup: customLookup,
});

async function seed() {
  console.log("[SEED] Connecting to Neon Postgres...");
  const client = await pool.connect();
  try {
    console.log("[SEED] Initializing synthetic run...");
    const runRes = await client.query(
      `INSERT INTO runs (source_id, input, status, records_raw, records_deduped, started_at, finished_at)
       VALUES ($1, $2, 'succeeded', 2, 2, NOW(), NOW()) RETURNING id`,
      ["gmaps", JSON.stringify({ city: "Columbus, OH", keyword: "med spa" })]
    );
    const runId = runRes.rows[0].id;
    console.log(`[SEED] Created run: ${runId}`);

    // Lead 1: High Intent Lead with Active Ads
    await client.query(
      `INSERT INTO leads (
        name, niche, phone_e164, email, website, domain, address, city, state, zip,
        decision_maker, signals, score, score_reasons, status, dedupe_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (dedupe_key) DO UPDATE SET score = EXCLUDED.score`,
      [
        "Glow Aesthetics & Wellness",
        "med spa",
        "+16145550101",
        "contact@glowaesthetics.com",
        "https://glowaesthetics.com",
        "glowaesthetics.com",
        "100 N High St",
        "Columbus",
        "OH",
        "43215",
        JSON.stringify({ name: "Dr. Sarah Jenkins", title: "Medical Director", email: "s.jenkins@glowaesthetics.com", confidence: "HIGH" }),
        JSON.stringify([
          { type: "ad_active", value: true, source: "adstransparency" },
          { type: "review_count", value: 142, rating: 4.9 }
        ]),
        95,
        JSON.stringify([
          "Base baseline score: 50",
          "+10: Has active website",
          "+10: Direct phone number available",
          "+15: Direct verified business email",
          "+20: Identified decision-maker (Medical Director)",
          "+25: High commercial intent (Actively running paid ads)",
          "+10: Established reputation (142 reviews)"
        ]),
        "qualified",
        "dom:glowaesthetics.com"
      ]
    );

    // Lead 2: Missing Website Opportunity
    await client.query(
      `INSERT INTO leads (
        name, niche, phone_e164, email, website, domain, address, city, state, zip,
        decision_maker, signals, score, score_reasons, status, dedupe_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (dedupe_key) DO UPDATE SET score = EXCLUDED.score`,
      [
        "Buckeye Med Clinic",
        "med spa",
        "+16145550199",
        null,
        null,
        null,
        "450 W Lane Ave",
        "Columbus",
        "OH",
        "43201",
        JSON.stringify({ name: null }),
        JSON.stringify([
          { type: "no_website", value: true },
          { type: "review_count", value: 38, rating: 4.7 }
        ]),
        75,
        JSON.stringify([
          "Base baseline score: 50",
          "+15: No website (Prime candidate for Web+AI receptionist bundle)",
          "+10: Direct phone number available"
        ]),
        "new",
        "ph:+16145550199"
      ]
    );

    console.log("[SEED] Synthetic data seed completed successfully!");
  } catch (err) {
    console.error("[SEED] Seeding error:", err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
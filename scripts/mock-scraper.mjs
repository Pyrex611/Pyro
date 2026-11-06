import { createHmac } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// 1. Read Secret & URL
function loadEnv() {
  const p = resolve(process.cwd(), ".env.local");
  if (existsSync(p)) {
    const text = readFileSync(p, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const [k, ...v] = line.split("=");
      if (k && v.length) process.env[k.trim()] = v.join("=").trim().replace(/['"]/g, "");
    }
  }
}
loadEnv();

const secret = process.env.PYRO_WEBHOOK_SECRET || "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069";
const targetHost = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";

async function simulateScrape(runId = process.argv[2]) {
  if (!runId) {
    console.error("Usage: node scripts/mock-scraper.mjs <RUN_ID>");
    console.error("Or pass RUN_ID generated from the UI /api/runs");
    process.exit(1);
  }

  console.log(`[MOCK SCRAPER] Initiating scrape for run: ${runId}`);
  console.log(`[MOCK SCRAPER] Gathering Google Maps & website enrichment data...`);

  await new Promise((r) => setTimeout(r, 2000));

  // 5 Realistic Healthcare Discovered Records
  const results = [
    {
      place_id: "ChIJ_zN1_sample_1",
      name: "Columbus Laser & Aesthetics",
      formatted_address: "1200 N High St, Columbus, OH 43201",
      international_phone_number: "+1 614-555-0155",
      website: "https://columbuslaser.example.com",
      rating: 4.9,
      user_ratings_total: 180,
      fallback_data: {
        emails: ["info@columbuslaser.example.com"],
        ad_active: true,
        owner: { name: "Dr. Marcus Vance", title: "Medical Director" },
      },
    },
    {
      place_id: "ChIJ_zN2_sample_2",
      name: "Short North Glow Lounge",
      formatted_address: "650 N High St, Columbus, OH 43215",
      international_phone_number: "+1 614-555-0188",
      website: null, // Combo target!
      rating: 4.8,
      user_ratings_total: 62,
      fallback_data: {},
    },
    {
      place_id: "ChIJ_zN3_sample_3",
      name: "Buckeye Dermal Care",
      formatted_address: "300 W Lane Ave, Columbus, OH 43210",
      international_phone_number: "+1 614-555-0200",
      website: "https://buckeyedermal.example.com",
      rating: 4.6,
      user_ratings_total: 94,
      fallback_data: {
        ad_active: true,
        emails: ["appointments@buckeyedermal.example.com"],
      },
    },
  ];

  const payload = JSON.stringify({
    runId,
    keyword: "med spa",
    isFinal: true,
    results,
  });

  // Generate HMAC Signature
  const hmac = createHmac("sha256", secret);
  const signature = hmac.update(payload).digest("hex");

  const webhookUrl = `${targetHost}/api/runs/${runId}/webhook`;
  console.log(`[MOCK SCRAPER] Sending signed callback to: ${webhookUrl}`);

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-pyro-signature": signature,
    },
    body: payload,
  });

  const text = await res.text();
  console.log(`[MOCK SCRAPER] Response (${res.status}):`, text);
}

simulateScrape();
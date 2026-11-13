import { NextResponse } from "next/server";
import { isNeonConfigured, isApifyConfigured, isMoltsetsConfigured, isGmapsConfigured } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    providers: {
      neon: { configured: isNeonConfigured() },
      nppes: { configured: true }, // Free public government API: always ready!
      apify: { configured: isApifyConfigured() },
      moltsets: { configured: isMoltsetsConfigured() },
      gmaps: { configured: isGmapsConfigured() },
      mock: { configured: true },
    },
    timestamp: new Date().toISOString(),
  });
}
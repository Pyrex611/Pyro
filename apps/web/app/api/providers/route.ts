import { NextResponse } from "next/server";
import { isNeonConfigured, isApifyConfigured, isMoltsetsConfigured } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    providers: {
      neon: { configured: isNeonConfigured() },
      apify: { configured: isApifyConfigured() },
      moltsets: { configured: isMoltsetsConfigured() },
      mock: { configured: true },
    },
    timestamp: new Date().toISOString(),
  });
}
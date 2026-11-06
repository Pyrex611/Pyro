import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { isNeonConfigured } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  let dbOk = false;
  if (isNeonConfigured()) {
    try {
      const pool = getDbPool();
      await pool.query("SELECT 1");
      dbOk = true;
    } catch {
      dbOk = false;
    }
  }

  return NextResponse.json({
    status: dbOk ? "healthy" : "degraded",
    engine: "Neon Serverless Postgres",
    databaseConnected: dbOk,
    timestamp: new Date().toISOString(),
  });
}
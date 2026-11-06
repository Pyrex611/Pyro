export const dynamic = "force-dynamic";

import { isNeonConfigured, isApifyConfigured, isMoltsetsConfigured } from "@/lib/config";
import { getDbPool } from "@/lib/db";
import { getMoltsetsAccountUsage } from "@/lib/providers/moltsets";

export default async function SettingsPage() {
  let dbStatus = "Disconnected";
  if (isNeonConfigured()) {
    try {
      const pool = getDbPool();
      await pool.query("SELECT 1");
      dbStatus = "Connected (Neon Serverless Postgres)";
    } catch (e: any) {
      dbStatus = `Connection Error: ${e.message}`;
    }
  }

  const apifyOk = isApifyConfigured();
  const moltsetsOk = isMoltsetsConfigured();

  // Fetch real-time MoltSets telemetry if key is present
  let moltsetsTelemetry: any = null;
  if (moltsetsOk) {
    moltsetsTelemetry = await getMoltsetsAccountUsage();
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform Settings</h1>
        <p className="text-sm text-gray-500">
          Environment configuration, provider API quotas, and database telemetry.
        </p>
      </div>

      {/* Database Status */}
      <div className="card space-y-4">
        <h2 className="text-base font-semibold">Database Engine</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs text-gray-400">Backend Provider</div>
            <div className="font-medium mt-1">Neon Serverless Postgres</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">Connection Health</div>
            <div className="font-medium mt-1 flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${dbStatus.startsWith("Connected") ? "bg-emerald-500" : "bg-red-500"}`}></span>
              {dbStatus}
            </div>
          </div>
        </div>
      </div>

      {/* Provider Containers */}
      <div className="card space-y-4">
        <h2 className="text-base font-semibold">Provider Containers & API Integrations</h2>
        <div className="divide-y divide-gray-100 text-sm">
          {/* Apify */}
          <div className="py-3 flex items-center justify-between">
            <div>
              <div className="font-medium">Apify Scraping Hub</div>
              <div className="text-xs text-gray-400">Google Maps actors, website content crawlers, and proxy network</div>
            </div>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${apifyOk ? "bg-[#e6f2ee] text-[#0f6e56]" : "bg-gray-100 text-gray-500"}`}>
              {apifyOk ? "✓ APIFY_TOKEN Active" : "Missing APIFY_TOKEN"}
            </span>
          </div>

          {/* MoltSets */}
          <div className="py-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">MoltSets Contact API</div>
                <div className="text-xs text-gray-400">Official tools: search_people, search_companies, linkedin_to_best_email</div>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${moltsetsOk ? "bg-[#e6f2ee] text-[#0f6e56]" : "bg-gray-100 text-gray-500"}`}>
                {moltsetsOk ? "✓ MOLTSETS_API_KEY Active" : "Missing MOLTSETS_API_KEY"}
              </span>
            </div>

            {moltsetsTelemetry?.active && (
              <div className="p-3 rounded bg-gray-50 border text-xs text-gray-600 space-y-1">
                <div className="font-medium text-gray-800">MoltSets Account Telemetry:</div>
                {moltsetsTelemetry.tokensRemaining != null && (
                  <div>Tokens Remaining: <b>{moltsetsTelemetry.tokensRemaining}</b></div>
                )}
                {moltsetsTelemetry.fairUse && (
                  <div className="text-[11px] text-gray-500">
                    Fair-Use 5h Records Remaining: <b>{moltsetsTelemetry.fairUse.records_remaining_5h ?? "Unlimited"}</b>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
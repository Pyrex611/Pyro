import { isNeonConfigured } from "@/lib/config";

export function StatusBanner() {
  const dbOk = isNeonConfigured();
  if (dbOk) return null;

  return (
    <div className="px-8 pt-4">
      <div className="p-3 rounded-lg border bg-amber-50 border-amber-200 text-amber-800 text-xs flex items-center justify-between">
        <span>
          ⚠️ <b>DATABASE_URL</b> is not detected. Data will not persist until your Neon connection string is added to <code>apps/web/.env.local</code>.
        </span>
      </div>
    </div>
  );
}
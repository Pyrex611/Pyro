const map: Record<string, string> = {
  queued: "bg-gray-100 text-gray-700",
  running: "bg-blue-50 text-blue-700 border border-blue-200",
  succeeded: "bg-[#e6f2ee] text-[#0f6e56] font-semibold",
  failed: "bg-red-50 text-red-700 border border-red-200",
  canceled: "bg-amber-50 text-amber-700 border border-amber-200",
  qualified: "bg-[#e6f2ee] text-[#0f6e56] font-semibold",
  new: "bg-gray-100 text-gray-700",
};

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const cls = map[normalized] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs capitalize ${cls}`}>
      {status}
    </span>
  );
}
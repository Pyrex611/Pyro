export function relativeTime(iso?: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.round(ms / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function money(spend?: Record<string, number> | null): string {
  if (!spend) return "$0.00";
  const total = Object.values(spend).reduce((a, b) => a + b, 0);
  return `$${total.toFixed(2)}`;
}

export function formatNumber(n?: number | null): string {
  if (n == null) return "0";
  return new Intl.NumberFormat("en-US").format(n);
}
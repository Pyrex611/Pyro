export function normalizePhone(raw?: string): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  if (digits.length >= 11 && raw.trim().startsWith("+")) return "+" + digits;
  return undefined;
}

export function normalizeDomain(raw?: string): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return host.includes(".") ? host : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeAddress(raw?: string): string | undefined {
  if (!raw) return undefined;
  return raw.replace(/\s+/g, " ").trim() || undefined;
}

export const GENERIC_DOMAINS = new Set([
  "facebook.com", "instagram.com", "linktr.ee", "yelp.com", "vagaro.com",
  "square.site", "wixsite.com", "squarespace.com", "google.com", "linkedin.com", "tiktok.com"
]);
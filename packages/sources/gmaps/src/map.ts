import type { LeadCandidate, RawRecord } from "@pyro/core";

/**
 * Normalizes raw Google Maps/Places API payloads and Puppeteer enrichment
 * into the canonical LeadCandidate schema.
 */
export function mapPlaceToCandidate(raw: RawRecord, defaultNiche: string): LeadCandidate {
  const p = raw.payload as any;
  const loc = p?.geometry?.location ?? {};
  const fallback = p?.fallback_data ?? {};

  const signals: { type: string; value: unknown }[] = [];

  if (p?.rating != null) {
    signals.push({ type: "rating", value: p.rating });
  }
  if (p?.user_ratings_total != null) {
    signals.push({ type: "review_count", value: p.user_ratings_total });
  }
  if (!p?.website) {
    signals.push({ type: "no_website", value: true });
  }
  if (fallback?.ad_active || p?.ad_active) {
    signals.push({ type: "ad_active", value: true });
  }
  if (fallback?.social_media?.length) {
    signals.push({ type: "social_links", value: fallback.social_media });
  }
  if (p?.types?.some((t: string) => t.includes("hospital") || t.includes("health"))) {
    signals.push({ type: "healthcare_facility", value: true });
  }

  // Extract owner / decision maker if discovered by crawler
  const decisionMaker = fallback?.owner ? {
    name: fallback.owner.name,
    title: fallback.owner.title ?? "Owner / Medical Director",
    email: fallback.owner.email,
    phone: fallback.owner.phone,
    confidence: "MEDIUM" as const,
  } : undefined;

  const email = fallback?.emails?.[0] ?? p?.email;
  const phone = p?.international_phone_number ?? p?.formatted_phone_number ?? fallback?.phones?.[0];

  return {
    name: p?.name ?? "Unnamed Practice",
    niche: defaultNiche,
    phone: phone || undefined,
    email: email || undefined,
    website: p?.website || undefined,
    address: p?.formatted_address || undefined,
    city: extractCity(p?.formatted_address),
    state: extractState(p?.formatted_address),
    zip: extractZip(p?.formatted_address),
    lat: typeof loc.lat === "number" ? loc.lat : undefined,
    lng: typeof loc.lng === "number" ? loc.lng : undefined,
    decisionMaker,
    signals,
  };
}

function extractCity(address?: string): string | undefined {
  if (!address) return undefined;
  const parts = address.split(",");
  return parts.length >= 2 ? parts[1]?.trim() : undefined;
}

function extractState(address?: string): string | undefined {
  if (!address) return undefined;
  const match = address.match(/\b([A-Z]{2})\b\s+\d{5}/);
  return match ? match[1] : undefined;
}

function extractZip(address?: string): string | undefined {
  if (!address) return undefined;
  const match = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  return match ? match[1] : undefined;
}
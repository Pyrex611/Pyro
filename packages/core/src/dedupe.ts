import { createHash } from "node:crypto";
import { normalizeDomain, normalizePhone, GENERIC_DOMAINS } from "./normalize";
import type { LeadCandidate } from "./types";

/**
 * Deterministic Dedupe Key Generator (Zero-Randomness)
 * Ensures repeated scrapes for the same practice always resolve to the identical key.
 */
export function generateDedupeKey(lead: Partial<LeadCandidate>): string {
  // 1. Authoritative Domain Key
  if (lead.website) {
    const domain = normalizeDomain(lead.website);
    if (domain && !GENERIC_DOMAINS.has(domain)) {
      return `dom:${domain}`;
    }
  }

  // 2. Authoritative Phone Key
  if (lead.phone) {
    const phone = normalizePhone(lead.phone);
    if (phone) {
      return `ph:${phone}`;
    }
  }

  // 3. Provider NPI Key
  if (lead.npi && lead.npi.trim().length >= 10) {
    return `npi:${lead.npi.trim()}`;
  }

  // 4. Deterministic Name + Location Key
  const cleanName = lead.name?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  const city = lead.city?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  const state = lead.state?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  const zip = lead.zip?.trim() ?? "";

  if (cleanName.length >= 3) {
    if (zip && zip.length >= 5) {
      const hash = createHash("sha256").update(`${cleanName}:${zip}`).digest("hex").slice(0, 16);
      return `nz:${hash}`;
    }
    if (city || state) {
      return `nm:${cleanName}:${city}_${state}`;
    }
    return `nm:${cleanName}`;
  }

  // 5. Fallback for completely unnamed entities
  const fallbackHash = createHash("sha256")
    .update(JSON.stringify({ phone: lead.phone, email: lead.email, website: lead.website }))
    .digest("hex")
    .slice(0, 16);

  return `anon:${fallbackHash}`;
}
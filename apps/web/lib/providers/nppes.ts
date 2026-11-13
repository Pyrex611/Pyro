import type { LeadCandidate, RawRecord } from "@pyro/core";
import { normalizePhone } from "@pyro/core";

const NPPES_API_URL = "https://npiregistry.cms.hhs.gov/api/?version=2.1";

export interface NppesSearchInput {
  city?: string;
  state?: string;
  postal_code?: string;
  taxonomy_description?: string;
  enumeration_type?: "NPI-1" | "NPI-2" | ""; // NPI-1 = Individual, NPI-2 = Organization
  limit?: number;
}

// Common MedSpa & Aesthetics CMS Taxonomies
export const AESTHETICS_TAXONOMY_PRESETS = [
  { label: "Dermatology (Medical Directors)", value: "Dermatology" },
  { label: "Plastic Surgery (Cosmetic & Reconstructive)", value: "Plastic Surgery" },
  { label: "Facial Plastic Surgery", value: "Facial Plastic Surgery" },
  { label: "Nurse Practitioner (Adult Health / Injectors)", value: "Nurse Practitioner" },
  { label: "Ambulatory Health Care Facilities (Clinics)", value: "Ambulatory Health Care Facilities" },
  { label: "Family Medicine (MedSpa Directors)", value: "Family Medicine" },
];

function toTitleCase(str?: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export async function searchNppesRegistry(input: NppesSearchInput): Promise<{
  rawRecords: RawRecord[];
  candidates: LeadCandidate[];
}> {
  const p = new URLSearchParams();
  if (input.city) p.set("city", input.city.trim());
  if (input.state) p.set("state", input.state.trim().toUpperCase());
  if (input.postal_code) p.set("postal_code", input.postal_code.trim().slice(0, 5));
  if (input.taxonomy_description) p.set("taxonomy_description", input.taxonomy_description.trim());
  if (input.enumeration_type) p.set("enumeration_type", input.enumeration_type);

  p.set("limit", String(Math.min(Math.max(Number(input.limit || 20), 1), 200)));

  const requestUrl = `${NPPES_API_URL}&${p.toString()}`;
  console.log(`[NPPES] Querying federal registry: ${requestUrl}`);

  const res = await fetch(requestUrl, {
    method: "GET",
    headers: { "Accept": "application/json" },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown NPPES error");
    throw new Error(`NPPES Registry returned HTTP ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json().catch(() => ({}));
  const results: any[] = data.results || [];
  console.log(`[NPPES] Successfully retrieved ${results.length} verified medical entities.`);

  const rawRecords: RawRecord[] = [];
  const candidates: LeadCandidate[] = [];

  for (const item of results) {
    const npiNumber = String(item.number);
    const basic = item.basic || {};
    const isOrg = item.enumeration_type === "NPI-2";

    // 1. Resolve Practice / Clinic Name
    let businessName = "";
    if (isOrg && basic.organization_name) {
      businessName = toTitleCase(basic.organization_name);
    } else {
      const docName = `${basic.first_name || ""} ${basic.last_name || ""}`.trim();
      const credential = basic.credential ? `, ${basic.credential.toUpperCase().replace(/\./g, "")}` : ", MD";
      businessName = toTitleCase(docName) + credential;
    }

    // 2. Resolve Physical Location Address (Filter LOCATION over MAILING)
    const addresses: any[] = item.addresses || [];
    const locationAddr = addresses.find((a) => a.address_purpose === "LOCATION") || addresses[0] || {};

    const street = toTitleCase(locationAddr.address_1);
    const city = toTitleCase(locationAddr.city) || input.city;
    const state = locationAddr.state?.toUpperCase() || input.state;
    const zip = locationAddr.postal_code ? locationAddr.postal_code.slice(0, 5) : undefined;
    const fullAddress = [street, city, state, zip].filter(Boolean).join(", ");

    // 3. Resolve Credentialed Direct Phone
    const rawPhone = locationAddr.telephone_number || basic.authorized_official_telephone_number;
    const phone = rawPhone ? normalizePhone(rawPhone) : undefined;

    // 4. Resolve Decision Maker Dossier
    let decisionMaker: any = undefined;
    if (isOrg && (basic.authorized_official_first_name || basic.authorized_official_last_name)) {
      const officialName = toTitleCase(
        `${basic.authorized_official_first_name || ""} ${basic.authorized_official_last_name || ""}`.trim()
      );
      decisionMaker = {
        name: officialName,
        title: toTitleCase(basic.authorized_official_title_or_position || "Authorized Official / Director"),
        phone: basic.authorized_official_telephone_number ? normalizePhone(basic.authorized_official_telephone_number) : phone,
        confidence: "HIGH" as const,
      };
    } else if (!isOrg && (basic.first_name || basic.last_name)) {
      decisionMaker = {
        name: toTitleCase(`${basic.first_name || ""} ${basic.last_name || ""}`.trim()),
        title: basic.credential ? `${basic.credential.toUpperCase()} / Practice Owner` : "Medical Director",
        phone,
        confidence: "HIGH" as const,
      };
    }

    // 5. Medical Taxonomies
    const taxonomies: any[] = item.taxonomies || [];
    const primaryTaxonomy = taxonomies.find((t) => t.primary) || taxonomies[0] || {};
    const specialtyDesc = primaryTaxonomy.desc ? toTitleCase(primaryTaxonomy.desc) : input.taxonomy_description || "Healthcare";

    const raw: RawRecord = {
      sourceId: "nppes",
      sourceRef: npiNumber,
      payload: item,
    };

    const candidate: LeadCandidate = {
      name: businessName,
      niche: specialtyDesc,
      phone,
      address: fullAddress || undefined,
      city,
      state,
      zip,
      npi: npiNumber,
      decisionMaker,
      signals: [
        { type: "npi_number", value: npiNumber },
        { type: "enumeration_type", value: item.enumeration_type },
        { type: "taxonomy_code", value: primaryTaxonomy.code },
        { type: "taxonomy_description", value: primaryTaxonomy.desc },
        ...(primaryTaxonomy.license ? [{ type: "state_medical_license", value: primaryTaxonomy.license }] : []),
        ...(basic.enumeration_date ? [{ type: "npi_enumeration_date", value: basic.enumeration_date }] : []),
      ],
    };

    rawRecords.push(raw);
    candidates.push(candidate);
  }

  return { rawRecords, candidates };
}
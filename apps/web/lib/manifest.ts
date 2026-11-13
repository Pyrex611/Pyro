import { VALID_EMPLOYEE_RANGES } from "@/lib/providers/moltsets";
import { AESTHETICS_TAXONOMY_PRESETS } from "@/lib/providers/nppes";

export type FieldType = "text" | "number" | "select";

export interface FieldDefinition {
  name: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  default: unknown;
  options?: { label: string; value: string }[];
  helperText?: string;
}

export interface ToolManifest {
  id: string;
  name: string;
  description: string;
  fields: FieldDefinition[];
}

export interface ProviderManifest {
  id: string;
  name: string;
  badge: string;
  description: string;
  missingConfigNotice?: string;
  tools: ToolManifest[];
}

// 1. NPPES FEDERAL MEDICAL REGISTRY ($0.00 FREE PUBLIC API)
export const nppesManifest: ProviderManifest = {
  id: "nppes",
  name: "NPPES Medical Registry (CMS NPI)",
  badge: "Federal Gold Standard ($0.00)",
  description: "Official CMS National Provider Identifier database: 100% verified legal clinic names, official direct phones, physical addresses, and licensed Medical Directors.",
  tools: [
    {
      id: "search_npi",
      name: "Physician & Clinic Taxonomy Search",
      description: "Discover verified medical practices and directors across US cities and states with official CMS taxonomy codes.",
      fields: [
        { name: "city", label: "City", type: "text", placeholder: "Columbus", default: "Columbus" },
        { name: "state", label: "State (2-Letter Code)", type: "text", placeholder: "OH", default: "OH" },
        {
          name: "taxonomy_description",
          label: "Medical Specialty Taxonomy",
          type: "select",
          default: "Dermatology",
          options: AESTHETICS_TAXONOMY_PRESETS,
          helperText: "Pre-filtered by CMS medical taxonomy to eliminate hospitals and non-aesthetic clinics.",
        },
        {
          name: "enumeration_type",
          label: "Entity Type",
          type: "select",
          default: "",
          options: [
            { label: "All Entities (Clinics & Physicians)", value: "" },
            { label: "Organizations & Clinics Only (NPI-2)", value: "NPI-2" },
            { label: "Individual Doctors Only (NPI-1)", value: "NPI-1" },
          ],
        },
        { name: "postal_code", label: "ZIP Code (Optional)", type: "text", placeholder: "43215", default: "" },
        { name: "limit", label: "Max Records (Up to 200)", type: "number", default: 20 },
      ],
    },
  ],
};

// 2. APIFY SCRAPING HUB
export const apifyManifest: ProviderManifest = {
  id: "apify",
  name: "Apify Scraping Hub",
  badge: "Cloud Actor Container",
  description: "Managed serverless actors: Facebook Ad Library, LinkedIn Jobs, B2B Lead Enricher, and Google Search.",
  missingConfigNotice: "APIFY_TOKEN is missing. Please add it to your environment variables.",
  tools: [
    {
      id: "facebook-ads",
      name: "Facebook Ads Library Scraper",
      description: "Scrapes active commercial ad campaigns, creatives, impressions, and advertiser links.",
      fields: [
        { name: "query", label: "Search Phrase or Facebook Page URL", type: "text", placeholder: "MedSpa in Ohio", default: "MedSpa in Ohio" },
        { name: "country", label: "Target Country Code", type: "select", default: "ALL", options: [{ label: "All Countries", value: "ALL" }, { label: "United States (US)", value: "US" }] },
        { name: "count", label: "Max Ads to Scrape", type: "number", default: 20 },
      ],
    },
    {
      id: "linkedin-jobs",
      name: "LinkedIn Jobs Hiring Scraper",
      description: "Extracts practices hiring for key roles (Medical Director, Esthetician) with recruiter contacts.",
      fields: [
        { name: "keywords", label: "Job Title or Role", type: "text", placeholder: "Medical Director", default: "Medical Director" },
        { name: "location", label: "Target Location", type: "text", placeholder: "Columbus, OH", default: "Columbus, OH" },
        { name: "limit", label: "Max Jobs to Scrape", type: "number", default: 20 },
      ],
    },
    {
      id: "google-search",
      name: "Google Search Results Scraper",
      description: "Extracts organic search results and filters out national directories (Expedia, TripAdvisor).",
      fields: [
        { name: "queries", label: "Google Search Queries", type: "text", placeholder: "Hotels in Seattle", default: "Hotels in Seattle" },
        { name: "countryCode", label: "Country Code", type: "select", default: "us", options: [{ label: "United States (us)", value: "us" }] },
        { name: "maxPagesPerQuery", label: "Max Pages per Query", type: "number", default: 1 },
      ],
    },
  ],
};

// 3. MOLTSETS CONTACT API
export const moltsetsManifest: ProviderManifest = {
  id: "moltsets",
  name: "MoltSets Contact API",
  badge: "B2B Identity Container",
  description: "B2B search & identity resolution: Decision-maker discovery, batch domain lookup, and deliverability-graded emails.",
  missingConfigNotice: "MOLTSETS_API_KEY is missing. Please add it to your environment variables.",
  tools: [
    {
      id: "search_people",
      name: "Decision-Maker & Doctor Search (search_people)",
      description: "Search clinic owners and directors across job titles, states, and industries with deliverability-graded emails.",
      fields: [
        { name: "title", label: "Job Title", type: "text", placeholder: "Medical Director, Owner, Physician", default: "Medical Director" },
        {
          name: "seniority_preset",
          label: "Seniority Filter",
          type: "select",
          default: "all_executives",
          options: [
            { label: "All Executives (Owner, C-Suite, VP, Partner, Director)", value: "all_executives" },
            { label: "Owners & Partners Only", value: "owners_only" },
            { label: "Any Seniority", value: "any" },
          ],
        },
        { name: "country", label: "Country", type: "text", placeholder: "United States", default: "United States" },
        { name: "state", label: "State (Optional)", type: "text", placeholder: "Ohio, Texas, California", default: "" },
        {
          name: "maxPerCompany",
          label: "Max Contacts Per Practice",
          type: "select",
          default: "2",
          options: [
            { label: "Max 1 per company", value: "1" },
            { label: "Max 2 per company (Recommended)", value: "2" },
            { label: "Unlimited", value: "99" },
          ],
        },
        { name: "limit", label: "Result Count (Max 25)", type: "number", default: 10 },
      ],
    },
    {
      id: "batch_domains",
      name: "Batch Decision-Makers Across Companies",
      description: "Paste up to 100 clinic domains. Fetches senior executives across all companies in a single request.",
      fields: [
        { name: "domains", label: "Company Domains", type: "text", placeholder: "glowaesthetics.com, buckeyeskin.com", default: "" },
        { name: "title", label: "Job Title Filter (Optional)", type: "text", placeholder: "Medical Director, Owner", default: "" },
        { name: "limit", label: "Result Limit (Max 25)", type: "number", default: 25 },
      ],
    },
    {
      id: "linkedin_to_best_email",
      name: "LinkedIn to Best Business Email",
      description: "Resolves deliverability-graded business email (Grade A-D) from a direct LinkedIn profile URL.",
      fields: [
        { name: "linkedin_url", label: "LinkedIn Profile URL", type: "text", placeholder: "https://linkedin.com/in/username", default: "" },
      ],
    },
  ],
};

// 4. SELF-HOSTED GMAPS BASE SHELL (Preserved for Future Activation)
export const gmapsManifest: ProviderManifest = {
  id: "gmaps",
  name: "Google Maps Scraper (Self-Hosted)",
  badge: "Base Shell Integration",
  description: "Self-hosted Puppeteer scraping service. Connects automatically when your custom Cloud Run or VPS service is online.",
  missingConfigNotice: "GMAPS_SERVICE_URL is offline. Bring up the scraper container to enable.",
  tools: [
    {
      id: "legacy-scrape",
      name: "Geographic Discovery & Website Enrichment",
      description: "Discovers local clinic practices and crawls websites for emails and socials.",
      fields: [
        { name: "city", label: "City & State", type: "text", placeholder: "Columbus, OH", default: "Columbus, OH" },
        { name: "keyword", label: "Keyword", type: "text", placeholder: "med spa", default: "med spa" },
        { name: "radius", label: "Radius (Meters)", type: "number", default: 3000 },
      ],
    },
  ],
};

// 5. SYNTHETIC TEST PROVIDER
export const mockManifest: ProviderManifest = {
  id: "mock",
  name: "Synthetic Test Generator",
  badge: "Local Testing Tool",
  description: "Generates realistic, pre-scored healthcare leads for pipeline validation without using API credits.",
  tools: [
    {
      id: "synthetic-medspa",
      name: "Synthetic MedSpa Discovery",
      description: "Creates verified Columbus MedSpa leads with ratings, ad signals, and owner details.",
      fields: [{ name: "count", label: "Number of Leads", type: "number", default: 3 }],
    },
  ],
};

const manifestsMap: Record<string, ProviderManifest> = {
  [nppesManifest.id]: nppesManifest,
  [apifyManifest.id]: apifyManifest,
  [moltsetsManifest.id]: moltsetsManifest,
  [gmapsManifest.id]: gmapsManifest,
  [mockManifest.id]: mockManifest,
};

export function getProviderManifest(id: string): ProviderManifest | undefined {
  return manifestsMap[id];
}

export function getAllProviderManifests(): ProviderManifest[] {
  return Object.values(manifestsMap);
}
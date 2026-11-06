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

export const apifyManifest: ProviderManifest = {
  id: "apify",
  name: "Apify Scraping Hub",
  badge: "Cloud Actor Container",
  description: "Managed serverless actors: Google Maps discovery, website content crawling, and proxy rotation.",
  missingConfigNotice: "APIFY_TOKEN is missing. Please add it to your environment variables.",
  tools: [
    {
      id: "gmaps",
      name: "Google Maps Scraper",
      description: "Extracts clinic businesses, addresses, ratings, review counts, coordinates, and phone numbers.",
      fields: [
        { name: "city", label: "Target City & State", type: "text", placeholder: "Columbus, OH", default: "Columbus, OH" },
        { name: "keyword", label: "Healthcare Niche / Keyword", type: "text", placeholder: "med spa", default: "med spa" },
        { name: "maxResults", label: "Max Places to Crawl", type: "number", default: 20, helperText: "Controls Apify run credits." },
      ],
    },
  ],
};

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
            { label: "C-Suite Executives Only", value: "c_suite_only" },
            { label: "Any Seniority", value: "any" },
          ],
        },
        { name: "country", label: "Country", type: "text", placeholder: "United States", default: "United States" },
        { name: "state", label: "State (Optional)", type: "text", placeholder: "Ohio, Texas, California", default: "" },
        {
          name: "industry",
          label: "Industry Filter (Optional)",
          type: "select",
          default: "Health and Pharmaceuticals",
          options: [
            { label: "Health and Pharmaceuticals", value: "Health and Pharmaceuticals" },
            { label: "Professional and Business Services", value: "Professional and Business Services" },
            { label: "Any Industry", value: "" },
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
        {
          name: "domains",
          label: "Company Domains (Comma or Line-Separated)",
          type: "text",
          placeholder: "glowaesthetics.com, buckeyeskin.com",
          default: "",
          helperText: "Paste up to 100 domains. Excludes any domain already in your Pyro suppression list.",
        },
        { name: "title", label: "Job Title Filter (Optional)", type: "text", placeholder: "Medical Director, Owner", default: "" },
        { name: "limit", label: "Result Limit (Max 25)", type: "number", default: 25 },
      ],
    },
    {
      id: "search_companies",
      name: "Healthcare Clinic Search (search_companies)",
      description: "Discover healthcare practices and clinics by niche and location with verified corporate domain details.",
      fields: [
        { name: "query", label: "Clinic / Niche Query", type: "text", placeholder: "med spa", default: "med spa" },
        { name: "limit", label: "Result Limit (Max 25)", type: "number", default: 10 },
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
    {
      id: "linkedin_to_personal_email_usa",
      name: "LinkedIn to Personal Email (USA)",
      description: "Resolves verified US personal email (Gmail/Yahoo/iCloud) for individual physicians or clinic owners.",
      fields: [
        { name: "linkedin_url", label: "LinkedIn Profile URL", type: "text", placeholder: "https://linkedin.com/in/username", default: "" },
      ],
    },
    {
      id: "linkedin_to_mobile_phone",
      name: "LinkedIn to Mobile Phone",
      description: "Retrieves carrier-verified mobile phone numbers (requires active phone token subscription).",
      fields: [
        { name: "linkedin_url", label: "LinkedIn Profile URL", type: "text", placeholder: "https://linkedin.com/in/username", default: "" },
      ],
    },
  ],
};

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
  [apifyManifest.id]: apifyManifest,
  [moltsetsManifest.id]: moltsetsManifest,
  [mockManifest.id]: mockManifest,
};

export function getProviderManifest(id: string): ProviderManifest | undefined {
  return manifestsMap[id];
}

export function getAllProviderManifests(): ProviderManifest[] {
  return Object.values(manifestsMap);
}
import { getDbPool } from "@/lib/db";
import {
  runApifyFacebookAdsScraper,
  runApifyLinkedinJobsScraper,
  runApifyLeadsScraper,
  runApifyGoogleSearchScraper,
  runApifyGmapsActor,
} from "@/lib/providers/apify";
import {
  searchMoltsetsPeople,
  searchMoltsetsCompanies,
  findDecisionMakersForDomains,
  moltsetsLinkedinToBestEmail,
  moltsetsLinkedinToPersonalEmail,
  moltsetsLinkedinToMobilePhone,
} from "@/lib/providers/moltsets";
import type { LeadCandidate, RawRecord } from "@pyro/core";

export async function executeTool(
  providerId: string,
  toolId: string,
  input: Record<string, any>
): Promise<{ rawRecords: RawRecord[]; candidates: LeadCandidate[]; metadata?: any }> {
  // =========================================================================
  // 1. APIFY SCAPERS
  // =========================================================================
  if (providerId === "apify") {
    if (toolId === "facebook-ads") {
      return runApifyFacebookAdsScraper({
        query: String(input.query || "MedSpa in Ohio"),
        country: input.country ? String(input.country) : "ALL",
        count: Number(input.count || 20),
      });
    }

    if (toolId === "linkedin-jobs") {
      return runApifyLinkedinJobsScraper({
        keywords: String(input.keywords || "Medical Director"),
        location: String(input.location || "Columbus, OH"),
        datePosted: input.datePosted ? String(input.datePosted) : "r604800",
        limit: Number(input.limit || 20),
      });
    }

    if (toolId === "leads-scraper") {
      return runApifyLeadsScraper({
        personTitle: input.personTitle ? String(input.personTitle) : "owner, medical director",
        seniority: input.seniority ? String(input.seniority) : "owner, c_suite, vp",
        companyDomain: input.companyDomain ? String(input.companyDomain) : undefined,
        country: input.country ? String(input.country) : "United States",
        limit: Number(input.limit || 20),
      });
    }

    if (toolId === "google-search") {
      return runApifyGoogleSearchScraper({
        queries: String(input.queries || "Hotels in Seattle"),
        countryCode: input.countryCode ? String(input.countryCode) : "us",
        maxPagesPerQuery: Number(input.maxPagesPerQuery || 1),
      });
    }

    if (toolId === "gmaps") {
      return runApifyGmapsActor({
        city: String(input.city || "Columbus, OH"),
        keyword: String(input.keyword || "med spa"),
        maxResults: Number(input.maxResults || 20),
      });
    }
  }

  // =========================================================================
  // 2. MOLTSETS B2B IDENTITY TOOLS
  // =========================================================================
  if (providerId === "moltsets") {
    let excludedDomains: string[] = [];
    try {
      const pool = getDbPool();
      const suppRes = await pool.query(
        `SELECT value FROM suppression WHERE kind = 'domain' LIMIT 100`
      );
      excludedDomains = suppRes.rows.map((r: any) => r.value.trim().toLowerCase());
    } catch {}

    if (toolId === "search_people") {
      let seniority: string[] | undefined;
      if (input.seniority_preset === "all_executives") {
        seniority = ["Owner", "C Suite", "Partner", "VP", "Head", "Director"];
      } else if (input.seniority_preset === "owners_only") {
        seniority = ["Owner", "Partner"];
      } else if (input.seniority_preset === "c_suite_only") {
        seniority = ["C Suite"];
      }

      return searchMoltsetsPeople({
        title: input.title ? String(input.title) : undefined,
        country: input.country ? String(input.country) : "United States",
        state: input.state ? String(input.state) : undefined,
        seniority,
        industry: input.industry ? String(input.industry) : undefined,
        employee_range: input.employee_range ? String(input.employee_range) : undefined,
        limit: Number(input.limit || 10),
        exclude_company_domain: excludedDomains,
      });
    }

    if (toolId === "batch_domains") {
      const rawDomains = String(input.domains || "");
      const domainList = rawDomains
        .split(/[\n,]/)
        .map((d) => d.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
        .filter(Boolean);

      return findDecisionMakersForDomains(domainList, {
        title: input.title ? String(input.title) : undefined,
        limit: Number(input.limit || 25),
        excludedDomains,
      });
    }

    if (toolId === "search_companies") {
      return searchMoltsetsCompanies({
        query: String(input.query || "med spa"),
        limit: Number(input.limit || 10),
      });
    }

    if (toolId === "linkedin_to_best_email") {
      return moltsetsLinkedinToBestEmail(String(input.linkedin_url));
    }

    if (toolId === "linkedin_to_personal_email_usa") {
      return moltsetsLinkedinToPersonalEmail(String(input.linkedin_url));
    }

    if (toolId === "linkedin_to_mobile_phone") {
      return moltsetsLinkedinToMobilePhone(String(input.linkedin_url));
    }
  }

  // =========================================================================
  // 3. SYNTHETIC LOCAL TESTING
  // =========================================================================
  if (providerId === "mock") {
    const timestamp = Date.now();
    return {
      rawRecords: [
        { sourceId: "mock", sourceRef: `mock_1_${timestamp}`, payload: { name: "Glow Aesthetics" } },
        { sourceId: "mock", sourceRef: `mock_2_${timestamp}`, payload: { name: "Columbus Skin Lab" } },
      ],
      candidates: [
        {
          name: "Glow Aesthetics",
          niche: "med spa",
          phone: "+16145550101",
          website: "https://glowaesthetics.example.com",
          city: "Columbus",
          state: "OH",
          decisionMaker: { name: "Dr. Sarah Vance", title: "Medical Director", confidence: "HIGH" },
          signals: [{ type: "ad_active", value: true }, { type: "rating", value: 4.9 }],
        },
        {
          name: "Columbus Skin Lab",
          niche: "med spa",
          phone: "+16145550102",
          city: "Columbus",
          state: "OH",
          signals: [{ type: "no_website", value: true }],
        },
      ],
    };
  }

  throw new Error(`No executor registered for ${providerId}:${toolId}`);
}
import { config } from "@/lib/config";
import type { LeadCandidate, RawRecord } from "@pyro/core";

const SEARCH_DIRECTORY_EXCLUSIONS = new Set([
  "google.com",
  "expedia.com",
  "hotels.com",
  "trivago.com",
  "kayak.com",
  "booking.com",
  "tripadvisor.com",
  "airbnb.com",
  "vrbo.com",
  "yelp.com",
  "yellowpages.com",
  "wikipedia.org",
]);

// Helper: Builds official Facebook Ads Library URL
export function buildFacebookAdsUrl(query: string, country = "ALL"): string {
  if (query.startsWith("http://") || query.startsWith("https://")) {
    return query;
  }
  const encodedQuery = encodeURIComponent(query.trim());
  return `https://web.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&is_targeted_country=false&media_type=all&q=${encodedQuery}&search_type=keyword_unordered&sort_data[direction]=desc&sort_data[mode]=total_impressions`;
}

// ============================================================================
// LOW-LEVEL APIFY REST ENGINE (ASYNC START + SMART POLLING)
// ============================================================================

export async function startApifyActorRun(actorId: string, input: Record<string, any>): Promise<{
  apifyRunId: string;
  defaultDatasetId: string;
  status: string;
}> {
  if (!config.apifyToken) {
    throw new Error("APIFY_TOKEN is missing. Please add it to your environment variables.");
  }

  const normalizedActorId = actorId.replace("/", "~");
  const url = `https://api.apify.com/v2/acts/${normalizedActorId}/runs?token=${config.apifyToken}`;

  console.log(`[APIFY] Starting actor run: ${normalizedActorId}`);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown Apify error");
    throw new Error(`Apify [${normalizedActorId}] failed to start (HTTP ${res.status}): ${errText.slice(0, 300)}`);
  }

  const json = await res.json();
  const run = json?.data;

  if (!run?.id || !run?.defaultDatasetId) {
    throw new Error("Apify did not return run ID or dataset ID.");
  }

  console.log(`[APIFY] Run started! ID: ${run.id}, Dataset ID: ${run.defaultDatasetId}, Status: ${run.status}`);
  return {
    apifyRunId: run.id,
    defaultDatasetId: run.defaultDatasetId,
    status: run.status,
  };
}

export async function getApifyRunStatus(apifyRunId: string, waitForFinishSecs = 0): Promise<{
  status: "READY" | "RUNNING" | "SUCCEEDED" | "FAILED" | "ABORTED" | "TIMED-OUT";
  defaultDatasetId: string;
  exitCode?: number;
}> {
  if (!config.apifyToken) {
    throw new Error("APIFY_TOKEN is missing.");
  }

  const waitParam = waitForFinishSecs > 0 ? `&waitForFinish=${waitForFinishSecs}` : "";
  const url = `https://api.apify.com/v2/actor-runs/${apifyRunId}?token=${config.apifyToken}${waitParam}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to check Apify run status (${res.status})`);
  }

  const json = await res.json();
  const data = json?.data;
  return {
    status: data?.status,
    defaultDatasetId: data?.defaultDatasetId,
    exitCode: data?.exitCode,
  };
}

export async function fetchApifyDatasetItems<T = any>(datasetId: string, limit = 100): Promise<T[]> {
  if (!config.apifyToken) {
    throw new Error("APIFY_TOKEN is missing.");
  }

  const url = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${config.apifyToken}&clean=true&limit=${limit}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch Apify dataset items (${res.status})`);
  }

  return (await res.json().catch(() => [])) as T[];
}

export async function executeApifyActorWithWait<T = any>(
  actorId: string,
  input: Record<string, any>,
  maxWaitSecs = 40
): Promise<{
  apifyRunId: string;
  defaultDatasetId: string;
  status: string;
  items: T[];
}> {
  const { apifyRunId, defaultDatasetId } = await startApifyActorRun(actorId, input);

  console.log(`[APIFY] Waiting up to ${maxWaitSecs}s for run ${apifyRunId} to conclude...`);

  const runInfo = await getApifyRunStatus(apifyRunId, maxWaitSecs);
  console.log(`[APIFY] Run status after wait: ${runInfo.status}`);

  if (runInfo.status === "SUCCEEDED") {
    const items = await fetchApifyDatasetItems<T>(defaultDatasetId);
    console.log(`[APIFY] Scrape finished! Retrieved ${items.length} records from dataset.`);
    return {
      apifyRunId,
      defaultDatasetId,
      status: "SUCCEEDED",
      items,
    };
  }

  if (runInfo.status === "FAILED" || runInfo.status === "ABORTED" || runInfo.status === "TIMED-OUT") {
    throw new Error(`Apify actor run terminated with status: ${runInfo.status}`);
  }

  return {
    apifyRunId,
    defaultDatasetId,
    status: runInfo.status,
    items: [],
  };
}

/**
 * High-Level Synchronous Convenience Caller (Wraps executeApifyActorWithWait)
 */
export async function callApifyActor<T = any>(
  actorId: string,
  input: Record<string, any>,
  timeoutSecs = 45
): Promise<T[]> {
  const outcome = await executeApifyActorWithWait<T>(actorId, input, timeoutSecs);
  return outcome.items || [];
}

// ============================================================================
// DATASET NORMALIZATION MAPPERS
// ============================================================================

export function mapFacebookAdsItems(items: any[], query: string) {
  const rawRecords: RawRecord[] = [];
  const candidates: LeadCandidate[] = [];

  for (const item of items) {
    const raw: RawRecord = {
      sourceId: "apify:facebook-ads",
      sourceRef: item.adArchiveID || item.id || `fb_ad_${Math.random().toString(36).substring(2, 9)}`,
      payload: item,
    };

    // Robust Name Extraction: Checks all official Facebook Ad Library properties
    const resolvedName =
      item.page_name ||
      item.pageName ||
      item.snapshot?.page_name ||
      item.page_profile_name ||
      item.advertiser_name ||
      item.advertiserName ||
      item.title ||
      item.page_title ||
      "Facebook Advertiser";

    const adBody = item.adCreativeBody || item.adBody || item.body || item.snapshot?.body?.markup || "";
    const snapshotUrl = item.adSnapshotURL || item.snapshotUrl || item.snapshot?.ad_snapshot_url;
    const publisherPlatforms = Array.isArray(item.publisherPlatform)
      ? item.publisherPlatform.join(", ")
      : item.publisherPlatform || item.snapshot?.publisher_platform?.join(", ");

    let website = item.linkUrl || item.pageProfileUri || item.snapshot?.link_url;
    if (website && (website.includes("facebook.com") || website.includes("fb.me"))) {
      website = item.linkUrl || undefined;
    }

    const candidate: LeadCandidate = {
      name: resolvedName,
      niche: query.startsWith("http") ? "Healthcare Ads" : query,
      website: website || undefined,
      signals: [
        { type: "ad_active", value: true },
        { type: "ad_source", value: "Facebook Ad Library" },
        ...(adBody ? [{ type: "ad_creative", value: String(adBody).slice(0, 500) }] : []),
        ...(snapshotUrl ? [{ type: "ad_snapshot_url", value: snapshotUrl }] : []),
        ...(publisherPlatforms ? [{ type: "ad_platforms", value: publisherPlatforms }] : []),
        ...(item.page_likes ? [{ type: "facebook_page_likes", value: item.page_likes }] : []),
      ],
    };

    rawRecords.push(raw);
    candidates.push(candidate);
  }

  return { rawRecords, candidates };
}

export function mapLinkedinJobsItems(items: any[], keywords: string) {
  const rawRecords: RawRecord[] = [];
  const candidates: LeadCandidate[] = [];

  for (const item of items) {
    const raw: RawRecord = {
      sourceId: "apify:linkedin-jobs",
      sourceRef: item.id || `li_job_${Math.random().toString(36).substring(2, 9)}`,
      payload: item,
    };

    const decisionMaker = item.recruiterName
      ? {
          name: item.recruiterName,
          title: "Hiring Manager / Recruiter",
          confidence: "MEDIUM" as const,
        }
      : undefined;

    const locParts = item.location ? item.location.split(",") : [];
    const city = locParts[0]?.trim();
    const state = locParts[1]?.trim();

    const candidate: LeadCandidate = {
      name: item.companyName || "Hiring Employer",
      niche: keywords,
      website: item.companyUrl || undefined,
      city,
      state,
      decisionMaker,
      signals: [
        { type: "hiring_active", value: true },
        { type: "open_role", value: item.title },
        ...(item.salary ? [{ type: "role_salary", value: item.salary }] : []),
        ...(item.url ? [{ type: "job_posting_url", value: item.url }] : []),
        ...(item.recruiterUrl ? [{ type: "recruiter_linkedin", value: item.recruiterUrl }] : []),
      ],
    };

    rawRecords.push(raw);
    candidates.push(candidate);
  }

  return { rawRecords, candidates };
}

export function mapGoogleSearchItems(items: any[], queries: string) {
  const rawRecords: RawRecord[] = [];
  const candidates: LeadCandidate[] = [];

  for (const batch of items) {
    const organicResults: any[] = batch?.organicResults || [];
    const queryTerm = batch?.searchQuery?.term || queries;

    for (const res of organicResults) {
      if (!res.url) continue;

      let domain = "";
      try {
        const u = new URL(res.url);
        domain = u.hostname.replace(/^www\./, "").toLowerCase();
      } catch {
        continue;
      }

      if (SEARCH_DIRECTORY_EXCLUSIONS.has(domain)) continue;

      const raw: RawRecord = {
        sourceId: "apify:google-search",
        sourceRef: `g_search_${Buffer.from(res.url).toString("base64").substring(0, 16)}`,
        payload: { query: queryTerm, ...res },
      };

      let cleanName = res.emphasizedKeywords?.[0];
      if (!cleanName || cleanName.length < 3) {
        cleanName = res.title?.split(/[|\-–]/)[0]?.trim() || domain;
      }

      const candidate: LeadCandidate = {
        name: cleanName,
        niche: queryTerm,
        website: res.url,
        signals: [
          { type: "google_search_query", value: queryTerm },
          { type: "google_search_rank", value: res.position },
          ...(res.description ? [{ type: "meta_description", value: res.description }] : []),
        ],
      };

      rawRecords.push(raw);
      candidates.push(candidate);
    }
  }

  return { rawRecords, candidates };
}

export function mapGooglePlacesItems(items: any[], keyword: string) {
  const rawRecords: RawRecord[] = [];
  const candidates: LeadCandidate[] = [];

  for (const item of items) {
    const raw: RawRecord = {
      sourceId: "apify:gmaps",
      sourceRef: item.placeId || item.id || `apify_g_${Math.random().toString(36).substring(2, 9)}`,
      payload: item,
    };

    const candidate: LeadCandidate = {
      name: item.title || item.name || "Unnamed Practice",
      niche: keyword,
      phone: item.phoneUnformatted || item.phone || undefined,
      website: item.website || undefined,
      address: item.address || undefined,
      city: item.city || undefined,
      state: item.state || undefined,
      zip: item.postalCode || undefined,
      lat: item.location?.lat,
      lng: item.location?.lng,
      signals: [
        ...(item.totalScore ? [{ type: "rating", value: item.totalScore }] : []),
        ...(item.reviewsCount ? [{ type: "review_count", value: item.reviewsCount }] : []),
        ...(!item.website ? [{ type: "no_website", value: true }] : []),
      ],
    };

    rawRecords.push(raw);
    candidates.push(candidate);
  }

  return { rawRecords, candidates };
}

// ============================================================================
// EXPORTED RUNNER WRAPPERS
// ============================================================================

export async function runApifyFacebookAdsScraper(input: {
  query: string;
  country?: string;
  count?: number;
}): Promise<{ rawRecords: RawRecord[]; candidates: LeadCandidate[] }> {
  const targetUrl = buildFacebookAdsUrl(input.query, input.country || "ALL");
  const actorInput = {
    urls: [{ url: targetUrl }],
    count: Math.min(Number(input.count || 20), 100),
    "scrapePageAds.period": "",
    "scrapePageAds.activeStatus": "active",
    "scrapePageAds.sortBy": "impressions_desc",
    "scrapePageAds.countryCode": input.country || "ALL",
  };

  const outcome = await executeApifyActorWithWait(
    "curious_coder/facebook-ads-library-scraper",
    actorInput,
    40
  );
  return mapFacebookAdsItems(outcome.items, input.query);
}

export async function runApifyLinkedinJobsScraper(input: {
  keywords: string;
  location: string;
  datePosted?: string;
  limit?: number;
}): Promise<{ rawRecords: RawRecord[]; candidates: LeadCandidate[] }> {
  const actorInput = {
    keywords: input.keywords,
    location: input.location,
    datePosted: input.datePosted || "r604800",
    limit: Math.min(Number(input.limit || 20), 100),
  };

  const outcome = await executeApifyActorWithWait(
    "valig/linkedin-jobs-scraper",
    actorInput,
    40
  );
  return mapLinkedinJobsItems(outcome.items, input.keywords);
}

export async function runApifyLeadsScraper(input: {
  personTitle?: string;
  seniority?: string;
  companyDomain?: string;
  country?: string;
  limit?: number;
}): Promise<{ rawRecords: RawRecord[]; candidates: LeadCandidate[] }> {
  const titles = input.personTitle
    ? input.personTitle.split(",").map((s) => s.trim().toLowerCase())
    : ["owner", "medical director", "founder"];

  const seniorities = input.seniority
    ? input.seniority.split(",").map((s) => s.trim().toLowerCase())
    : ["owner", "c_suite", "vp"];

  const domains = input.companyDomain
    ? input.companyDomain.split(",").map((s) => s.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
    : undefined;

  const actorInput: Record<string, any> = {
    personTitle: titles,
    seniority: seniorities,
    personCountry: [input.country || "United States"],
    totalResults: Math.min(Number(input.limit || 20), 100),
    companyMode: false,
  };

  if (domains && domains.length) {
    actorInput.companyDomain = domains;
  }

  const outcome = await executeApifyActorWithWait(
    "peakydev/leads-scraper-ppe",
    actorInput,
    40
  );

  const rawRecords: RawRecord[] = [];
  const candidates: LeadCandidate[] = [];

  for (const item of outcome.items) {
    const raw: RawRecord = {
      sourceId: "apify:leads-scraper",
      sourceRef: item.id || item.email || `lead_ppe_${Math.random().toString(36).substring(2, 9)}`,
      payload: item,
    };

    const fullName = item.fullName || `${item.firstName || ""} ${item.lastName || ""}`.trim();

    const candidate: LeadCandidate = {
      name: item.companyName || `${fullName}'s Practice`,
      niche: item.industry || "Healthcare",
      website: item.companyDomain ? `https://${item.companyDomain}` : undefined,
      phone: item.phone || item.mobilePhone || undefined,
      email: item.email || undefined,
      city: item.city || undefined,
      state: item.state || undefined,
      decisionMaker: {
        name: fullName || "Identified Decision Maker",
        title: item.title || "Owner / Executive",
        email: item.email || undefined,
        phone: item.mobilePhone || item.phone || undefined,
        confidence: item.email ? "HIGH" : "MEDIUM",
      },
      signals: [
        ...(item.linkedinUrl ? [{ type: "linkedin_url", value: item.linkedinUrl }] : []),
        ...(item.seniority ? [{ type: "seniority", value: item.seniority }] : []),
      ],
    };

    rawRecords.push(raw);
    candidates.push(candidate);
  }

  return { rawRecords, candidates };
}

export async function runApifyGoogleSearchScraper(input: {
  queries: string;
  countryCode?: string;
  maxPagesPerQuery?: number;
}): Promise<{ rawRecords: RawRecord[]; candidates: LeadCandidate[] }> {
  const actorInput = {
    queries: input.queries,
    countryCode: input.countryCode || "us",
    languageCode: "en",
    maxPagesPerQuery: input.maxPagesPerQuery || 1,
    mobileResults: false,
    includeUnfilteredResults: false,
  };

  const outcome = await executeApifyActorWithWait(
    "apify/google-search-scraper",
    actorInput,
    40
  );
  return mapGoogleSearchItems(outcome.items, input.queries);
}

export async function runApifyGmapsActor(input: {
  city: string;
  keyword: string;
  maxResults?: number;
}): Promise<{ rawRecords: RawRecord[]; candidates: LeadCandidate[] }> {
  const searchString = `${input.keyword} in ${input.city}`;
  const actorInput = {
    searchStringsArray: [searchString],
    maxCrawledPlacesPerSearch: input.maxResults || 20,
    language: "en",
    skipClosedPlaces: true,
  };

  const outcome = await executeApifyActorWithWait(
    "compass/crawler-google-places",
    actorInput,
    40
  );
  return mapGooglePlacesItems(outcome.items, input.keyword);
}

export async function runApifyWebsiteContentCrawler(input: {
  url: string;
  companyName?: string;
}): Promise<{ rawRecords: RawRecord[]; candidates: LeadCandidate[] }> {
  const targetUrl = input.url.startsWith("http") ? input.url : `https://${input.url}`;
  const actorInput = {
    startUrls: [{ url: targetUrl }],
    maxCrawlPages: 5,
    crawlerType: "cheerio",
  };

  const items = await callApifyActor<any>("apify/website-content-crawler", actorInput, 45).catch(() => []);

  const rawRecords: RawRecord[] = [];
  const candidates: LeadCandidate[] = [];

  for (const item of items) {
    const rawText = (item.text || "").slice(0, 150000); // ReDoS defense buffer

    const emailMatches = rawText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi) || [];

    // Clean, strictly-typed single-pass extraction
    const uniqueEmails: string[] = [];
    const seenEmails = new Set<string>();

    for (const match of emailMatches) {
      const lower = match.toLowerCase();
      if (
        !seenEmails.has(lower) &&
        !lower.includes("wixpress") &&
        !lower.includes("sentry") &&
        !lower.includes("example.com")
      ) {
        seenEmails.add(lower);
        uniqueEmails.push(lower);
      }
    }

    const phoneMatches = rawText.match(/(?:\+?1\s*(?:[.-]\s*)?)?(?:\(\s*([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9])\s*\)|([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9]))\s*(?:[.-]\s*)?([2-9]1[02-9]|[2-9][02-8][02-9])\s*(?:[.-]\s*)?([0-9]{4})/gi) || [];

    const raw: RawRecord = {
      sourceId: "apify:website-crawler",
      sourceRef: `web_${Buffer.from(item.url || input.url).toString("base64").slice(0, 16)}`,
      payload: item,
    };

    const primaryEmail: string | undefined = uniqueEmails[0];
    const primaryPhone: string | undefined = phoneMatches[0];

    const candidate: LeadCandidate = {
      name: input.companyName || "Discovered Clinic",
      niche: "Healthcare",
      website: item.url || input.url,
      email: primaryEmail,
      phone: primaryPhone,
      decisionMaker: primaryEmail ? {
        name: "Clinic Contact",
        title: "Medical Staff",
        email: primaryEmail,
        confidence: "MEDIUM",
      } : undefined,
      signals: [
        { type: "crawled_emails", value: uniqueEmails },
        ...(phoneMatches.length > 0 ? [{ type: "crawled_phones", value: phoneMatches.slice(0, 3) }] : []),
      ],
    };

    rawRecords.push(raw);
    candidates.push(candidate);
  }

  return { rawRecords, candidates };
}
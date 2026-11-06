export const dynamic = "force-dynamic";

import Link from "next/link";

const providers = [
  {
    id: "apify",
    name: "Apify Scraping Hub",
    badge: "Cloud Actor Container",
    description: "Managed serverless actors: Facebook Ads Library, LinkedIn Jobs, B2B Lead Enricher, and Google Search scraper.",
    tools: [
      "Facebook Ads Library Scraper",
      "LinkedIn Jobs Hiring Scraper",
      "B2B Lead Scraper & Enricher",
      "Google Search Results Scraper",
      "Google Maps Places Scraper",
    ],
  },
  {
    id: "moltsets",
    name: "MoltSets Contact API",
    badge: "B2B Identity Container",
    description: "B2B search & identity resolution: Decision-maker discovery, batch domain lookup, and deliverability-graded emails.",
    tools: [
      "Decision-Maker Search",
      "Batch Domain Decision-Makers",
      "Clinic Company Search",
      "LinkedIn to Best Email",
      "LinkedIn to Personal Email (USA)",
      "LinkedIn to Mobile Phone",
    ],
  },
  {
    id: "mock",
    name: "Synthetic Test Generator",
    badge: "Local Testing Tool",
    description: "Generates realistic, pre-scored healthcare leads for pipeline validation without using API credits.",
    tools: ["Synthetic MedSpa Discovery"],
  },
];

export default function SourcesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sources & Provider Hubs</h1>
        <p className="text-sm text-gray-500">
          Select a provider container to configure and execute specialized scrapers and enrichment tools.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {providers.map((p) => (
          <Link
            key={p.id}
            href={`/sources/${p.id}`}
            className="card flex flex-col justify-between h-full transition-all duration-150 hover:border-[#0f6e56] hover:shadow-md cursor-pointer bg-white no-underline block"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-lg">{p.name}</span>
                <span className="text-xs px-2 py-0.5 rounded font-medium bg-[#e6f2ee] text-[#0f6e56]">
                  {p.badge}
                </span>
              </div>
              <p className="text-xs mt-2 text-gray-600 leading-relaxed">{p.description}</p>

              <div className="mt-4 space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Included Scrapers & Tools ({p.tools.length}):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {p.tools.map((t, idx) => (
                    <span key={idx} className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
              <span className="text-xs font-mono text-gray-400">Provider: {p.id}</span>
              <span className="btn-primary text-xs px-3 py-1.5">
                Open Container Hub →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
import { z } from "zod";
import type { Source, RunHandle, RawRecord, LeadCandidate } from "@pyro/core";
import { mapPlaceToCandidate } from "./map";

export { mapPlaceToCandidate };
export * from "./map";

export const GmapsInputSchema = z.object({
  city: z.string().min(1, "City is required"),
  keyword: z.string().min(1, "Keyword/Niche is required"),
  radius: z.number().int().min(500).max(50000).default(5000),
  areas: z.array(z.string()).optional(),
});
export type GmapsInput = z.infer<typeof GmapsInputSchema>;

export interface GmapsAdapterConfig {
  baseUrl: string;
  token?: string;
  webhookBaseUrl: string;
  webhookSecret: string;
}

export class GmapsSource implements Source<GmapsInput> {
  readonly id = "gmaps";
  readonly label = "Google Maps & Places";
  readonly inputSchema: z.ZodType<GmapsInput, z.ZodTypeDef, any> = GmapsInputSchema;
  readonly costModel = {
    costPerRunUsd: 0.05,
    costPerRecordUsd: 0.002,
    unitName: "places",
  };

  constructor(private config: GmapsAdapterConfig) {}

  async health(): Promise<{ status: "healthy" | "degraded" | "down"; latencyMs: number }> {
    const t0 = Date.now();
    try {
      const res = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/health`, {
        signal: AbortSignal.timeout(4000),
      });
      return {
        status: res.ok ? "healthy" : "degraded",
        latencyMs: Date.now() - t0,
      };
    } catch {
      return { status: "down", latencyMs: Date.now() - t0 };
    }
  }

  async start(run: { runId: string; input: GmapsInput }): Promise<RunHandle> {
    const targetUrl = `${this.config.baseUrl.replace(/\/$/, "")}/scrape`;
    const callbackUrl = `${this.config.webhookBaseUrl.replace(/\/$/, "")}/api/runs/${run.runId}/webhook`;

    const payload = {
      runId: run.runId,
      ...run.input,
      callbackUrl,
    };

    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.config.token ? { authorization: `Bearer ${this.config.token}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      throw new Error(`Scraper HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }

    return {
      runId: run.runId,
      sourceId: this.id,
      startedAt: new Date().toISOString(),
    };
  }

  async poll(handle: RunHandle): Promise<{
    status: "queued" | "running" | "succeeded" | "failed" | "canceled";
    recordsFound: number;
    spendUsd: number;
    raw?: RawRecord[];
    error?: string;
  }> {
    return {
      status: "running",
      recordsFound: 0,
      spendUsd: 0,
    };
  }

  normalize(raw: RawRecord): LeadCandidate {
    return mapPlaceToCandidate(raw, (raw.payload as any)?.searchKeyword ?? "healthcare");
  }
}
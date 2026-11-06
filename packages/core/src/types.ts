import { z } from "zod";

export const CostModelSchema = z.object({
  costPerRunUsd: z.number().default(0),
  costPerRecordUsd: z.number().default(0),
  unitName: z.string().default("records"),
});

export const DecisionMakerSchema = z.object({
  name: z.string().optional(),
  title: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]).default("LOW"),
});
export type DecisionMaker = z.infer<typeof DecisionMakerSchema>;

export const SignalSchema = z.object({
  type: z.string(),
  value: z.unknown(),
  observedAt: z.string().optional(),
});
export type Signal = z.infer<typeof SignalSchema>;

export const RawRecordSchema = z.object({
  sourceId: z.string(),
  sourceRef: z.string(),
  payload: z.record(z.string(), z.unknown()),
  fetchedAt: z.string().optional(),
});
export type RawRecord = z.infer<typeof RawRecordSchema>;

export const LeadCandidateSchema = z.object({
  name: z.string().min(1),
  niche: z.string(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  website: z.string().url().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  npi: z.string().optional(),
  decisionMaker: DecisionMakerSchema.optional(),
  signals: z.array(SignalSchema).default([]),
});
export type LeadCandidate = z.infer<typeof LeadCandidateSchema>;

export interface RunHandle {
  runId: string;
  externalJobId?: string;
  sourceId: string;
  startedAt: string;
}

export interface Source<TInput = unknown> {
  id: string;
  label: string;
  inputSchema: z.ZodType<TInput, z.ZodTypeDef, any>;
  costModel: z.infer<typeof CostModelSchema>;
  health(): Promise<{ status: "healthy" | "degraded" | "down"; latencyMs: number }>;
  start(run: { runId: string; input: TInput }): Promise<RunHandle>;
  poll(handle: RunHandle): Promise<{
    status: "queued" | "running" | "succeeded" | "failed" | "canceled";
    recordsFound: number;
    spendUsd: number;
    raw?: RawRecord[];
    error?: string;
  }>;
  normalize(raw: RawRecord): LeadCandidate;
}
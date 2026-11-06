import { Budget, BudgetExceeded } from "./budget";
import type { RunStore } from "./store";
import type { Sink } from "./sinks";
import { SourceRecordSchema, type Adapter, type SourceRecord } from "./types";

export interface RunOptions {
  runId: string; budget?: Budget; sinks?: Sink[]; store?: RunStore; signal?: AbortSignal;
  batchSize?: number; maxRecords?: number; log?: (msg: string, data?: unknown) => void;
}
export interface RunSummary {
  runId: string; source: string; status: "succeeded" | "failed" | "canceled";
  records: number; invalid: number; spend: Record<string, number>; error?: string; durationMs: number;
}

export async function runAdapter(adapter: Adapter, rawInput: unknown, opts: RunOptions): Promise<RunSummary> {
  const t0 = Date.now();
  const { runId, sinks = [], store } = opts;
  const budget = opts.budget ?? new Budget({}, true);
  const log = opts.log ?? (() => {});
  const source = adapter.manifest.id;
  const ac = new AbortController();
  opts.signal?.addEventListener("abort", () => ac.abort());
  let records = 0, invalid = 0, buf: SourceRecord[] = [];
  let status: RunSummary["status"] = "succeeded", error: string | undefined;

  const flush = async () => {
    if (buf.length) { const b = buf; buf = []; for (const s of sinks) await s.write(b, { runId }); }
    await store?.progress(runId, { records, spend: budget.snapshot() });
    if (await store?.isCancelRequested(runId)) ac.abort();
  };
  try {
    const input = adapter.manifest.inputSchema.parse(rawInput);
    await store?.start(runId, source, input);
    const est = adapter.estimateCost(input);
    if (!budget.canAfford(est.units)) {
      const [k, n] = Object.entries(est.units).find(([k, n]) => n > budget.remaining(k))!;
      throw new BudgetExceeded(k, n, budget.remaining(k));
    }
    for (const [k, n] of Object.entries(est.units)) budget.spend(k, n);
    const it = adapter.run(input, { runId, signal: ac.signal, budget, log })[Symbol.asyncIterator]();
    for (;;) {
      if (ac.signal.aborted) { status = "canceled"; await it.return?.(); break; }
      const next = await it.next();
      if (next.done) break;
      const parsed = SourceRecordSchema.safeParse(next.value);
      if (!parsed.success) { invalid++; if (invalid <= 3) log("invalid record", parsed.error.issues); continue; }
      buf.push(parsed.data); records++;
      if (buf.length >= (opts.batchSize ?? 100)) await flush();
      if (opts.maxRecords && records >= opts.maxRecords) { await it.return?.(); break; }
    }
  } catch (e) {
    status = "failed"; error = e instanceof Error ? e.message : String(e);
  }
  try { await flush(); } catch (e) { if (status === "succeeded") { status = "failed"; error = e instanceof Error ? e.message : String(e); } }
  for (const s of sinks) await s.close().catch(() => {});
  const summary: RunSummary = { runId, source, status, records, invalid, spend: budget.snapshot(), error, durationMs: Date.now() - t0 };
  await store?.finish(summary).catch(() => {});
  return summary;
}

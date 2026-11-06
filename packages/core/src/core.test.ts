import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Budget, BudgetExceeded, MemorySink, MemoryRunStore, SupabaseRunStore, SupabaseSink, resolve, runAdapter, toCsvRow, normalizePhone, normalizeDomain, SourceRecordSchema, type Adapter } from "./index";

const mk = (over: Partial<Adapter> & { n?: number } = {}): Adapter => ({
  manifest: { id: "t", version: "1.0.0", role: "discovery", worker: "light", inputSchema: z.object({}) },
  estimateCost: () => ({ units: {}, usd: 0 }),
  async *run(_i, ctx) { for (let i = 0; i < (over.n ?? 250); i++) { if (ctx.signal.aborted) return; yield { source: "t", sourceId: String(i), payload: {} }; } },
  ...over,
});

describe("normalize", () => {
  it("phones", () => { expect(normalizePhone("(614) 555-0101")).toBe("+16145550101"); expect(normalizePhone("1-614-555-0101")).toBe("+16145550101"); expect(normalizePhone("123")).toBeUndefined(); });
  it("domains", () => { expect(normalizeDomain("https://www.Foo.com/a?b")).toBe("foo.com"); expect(normalizeDomain("nope")).toBeUndefined(); });
});
describe("resolver", () => {
  const rec = (o: object) => SourceRecordSchema.parse({ source: "s", sourceId: Math.random().toString(), payload: {}, ...o });
  it("merges on phone and ignores generic domains", () => {
    const e = resolve([rec({ name: "A", phone: "614-555-0101", website: "https://facebook.com/a" }), rec({ phone: "+1 (614) 555-0101", website: "https://facebook.com/b" }), rec({ name: "C", website: "https://facebook.com/c" })]);
    expect(e).toHaveLength(2);
  });
  it("merges on domain across sources", () => { expect(resolve([rec({ website: "https://a.com" }), rec({ website: "http://www.a.com/x" })])).toHaveLength(1); });
});
describe("budget", () => {
  it("is strict by default and hard-stops", () => {
    const b = new Budget({ x: 5 }); b.spend("x", 5);
    expect(() => b.spend("x", 1)).toThrow(BudgetExceeded);
    expect(() => b.spend("unknown", 1)).toThrow(BudgetExceeded);
  });
});
describe("csv", () => { it("escapes", () => { expect(toCsvRow(SourceRecordSchema.parse({ source: "s", sourceId: "1", payload: {}, name: 'A, "B"' }))).toContain('"A, ""B"""'); }); });
describe("runner", () => {
  it("batches, counts and persists", async () => {
    const sink = new MemorySink(), store = new MemoryRunStore();
    const s = await runAdapter(mk(), {}, { runId: "r1", sinks: [sink], store, batchSize: 100 });
    expect(s.status).toBe("succeeded"); expect(sink.records).toHaveLength(250); expect(store.last?.records).toBe(250);
  });
  it("honors maxRecords", async () => { expect((await runAdapter(mk(), {}, { runId: "r", maxRecords: 7 })).records).toBe(7); });
  it("refuses over-budget runs before starting", async () => {
    const a = mk({ estimateCost: () => ({ units: { "places.pro": 10 }, usd: 1 }) });
    const sink = new MemorySink();
    const s = await runAdapter(a, {}, { runId: "r", budget: new Budget({ "places.pro": 5 }), sinks: [sink] });
    expect(s.status).toBe("failed"); expect(s.error).toMatch(/Budget exceeded/); expect(sink.records).toHaveLength(0);
  });
  it("flushes partial results when the adapter throws", async () => {
    const a = mk({ async *run() { yield { source: "t", sourceId: "1", payload: {} }; throw new Error("boom"); } });
    const sink = new MemorySink(); const s = await runAdapter(a, {}, { runId: "r", sinks: [sink] });
    expect(s.status).toBe("failed"); expect(sink.records).toHaveLength(1);
  });
  it("cancels via store flag", async () => {
    const store = new MemoryRunStore(); store.cancel = true;
    const s = await runAdapter(mk({ n: 1000 }), {}, { runId: "r", store, batchSize: 10 });
    expect(s.status).toBe("canceled"); expect(s.records).toBeLessThan(1000);
  });
  it("counts invalid records without failing the run", async () => {
    const a = mk({ async *run() { yield { source: "t", sourceId: "", payload: {} } as any; yield { source: "t", sourceId: "ok", payload: {} }; } });
    const s = await runAdapter(a, {}, { runId: "r" }); expect(s.invalid).toBe(1); expect(s.records).toBe(1);
  });
});
describe("supabase adapters (fake client)", () => {
  const calls: any[] = [];
  const q: any = (t: string) => ({ upsert: (rows: any, o?: any) => { calls.push(["upsert", t, rows, o]); return Promise.resolve({ error: null }); }, update: (v: any) => ({ eq: (c: string, id: string) => { calls.push(["update", t, v, id]); return Promise.resolve({ error: null }); } }), select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { cancel_requested: true }, error: null }) }) }) });
  const db = { from: q };
  it("writes runs and raw_records", async () => {
    const store = new SupabaseRunStore(db), sink = new SupabaseSink(db, 2);
    await runAdapter(mk({ n: 5 }), {}, { runId: "r9", store, sinks: [sink], batchSize: 2 });
    expect(calls.filter((c) => c[1] === "raw_records").length).toBeGreaterThan(0);
    expect(calls.some((c) => c[0] === "update" && c[2].status === "canceled")).toBe(true);
  });
});

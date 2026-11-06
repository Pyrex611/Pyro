import { SourceRecordSchema, type Adapter } from "./types";
import { Budget } from "./budget";

/** Contract checks every adapter must pass. Returns a list of problems (empty = compliant). */
export async function checkAdapterContract(adapter: Adapter, sampleInput: unknown): Promise<string[]> {
  const bad: string[] = [];
  const m = adapter.manifest;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(m.id)) bad.push("manifest.id must be kebab-case");
  if (!/^\d+\.\d+\.\d+/.test(m.version)) bad.push("manifest.version must be semver");
  const parsed = m.inputSchema.safeParse(sampleInput);
  if (!parsed.success) return [...bad, "sample input fails inputSchema"];
  const est = adapter.estimateCost(parsed.data);
  if (est.usd < 0 || Object.values(est.units).some((n) => n < 0)) bad.push("estimateCost must be non-negative");
  const run = (signal: AbortSignal) => adapter.run(parsed.data, { runId: "contract-test", signal, budget: new Budget({}, false), log: () => {} });
  const ids = new Set<string>(); let n = 0;
  for await (const r of run(new AbortController().signal)) {
    const p = SourceRecordSchema.safeParse(r);
    if (!p.success) { bad.push("record fails schema: " + p.error.issues[0]?.message); break; }
    if (p.data.source !== m.id) bad.push(`record.source "${p.data.source}" must equal manifest.id`);
    if (ids.has(p.data.sourceId)) bad.push("duplicate sourceId " + p.data.sourceId);
    ids.add(p.data.sourceId); n++;
  }
  if (n === 0) bad.push("sample input produced no records");
  const ac = new AbortController(); let after = 0, seen = false;
  for await (const _ of run(ac.signal)) { if (seen) after++; else { seen = true; ac.abort(); } if (after > 10) break; }
  if (after > 10) bad.push("adapter ignores ctx.signal after abort");
  return bad;
}

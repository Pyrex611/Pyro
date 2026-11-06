import { createHash } from "node:crypto";
import { GENERIC_DOMAINS, normalizeAddress, normalizeDomain, normalizePhone } from "./normalize";
import type { SourceRecord } from "./types";

export interface Entity {
  id: string; name?: string; phone?: string; domain?: string; address?: string;
  lat?: number; lng?: number; niche: string[];
  members: { source: string; sourceId: string }[];
  signals: SourceRecord["signals"];
}
function keys(r: SourceRecord): string[] {
  const out: string[] = [];
  const p = normalizePhone(r.phone); if (p) out.push("p:" + p);
  const d = normalizeDomain(r.website); if (d && !GENERIC_DOMAINS.has(d)) out.push("d:" + d);
  const a = normalizeAddress(r.address); if (a) out.push("a:" + a);
  return out;
}
/** Resolver v0: union records sharing a phone, a non-generic domain, or a normalized address.
 *  Known limits (tightened in Phase 3): shared call-center phones can over-merge; no fuzzy name matching. */
export function resolve(records: SourceRecord[]): Entity[] {
  const parent = records.map((_, i) => i);
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]!]!; x = parent[x]!; } return x; };
  const seen = new Map<string, number>();
  records.forEach((r, i) => {
    for (const k of keys(r)) {
      const j = seen.get(k);
      if (j === undefined) seen.set(k, i);
      else { const a = find(i), b = find(j); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); }
    }
  });
  const groups = new Map<number, SourceRecord[]>();
  records.forEach((r, i) => { const g = find(i); (groups.get(g) ?? groups.set(g, []).get(g)!).push(r); });
  return [...groups.values()].map((rs) => {
    const first = <T,>(f: (r: SourceRecord) => T | undefined) => rs.map(f).find((v) => v !== undefined && v !== "");
    const members = rs.map((r) => ({ source: r.source, sourceId: r.sourceId }));
    const id = createHash("sha1").update(members.map((m) => `${m.source}:${m.sourceId}`).sort()[0]!).digest("hex").slice(0, 16);
    return {
      id, name: first((r) => r.name),
      phone: first((r) => normalizePhone(r.phone)), domain: first((r) => { const d = normalizeDomain(r.website); return d && !GENERIC_DOMAINS.has(d) ? d : undefined; }),
      address: first((r) => normalizeAddress(r.address)), lat: first((r) => r.lat), lng: first((r) => r.lng),
      niche: [...new Set(rs.flatMap((r) => r.niche))], members, signals: rs.flatMap((r) => r.signals),
    };
  });
}

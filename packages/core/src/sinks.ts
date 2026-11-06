import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { SourceRecord } from "./types";

export interface Sink { write(records: SourceRecord[], ctx: { runId: string }): Promise<void>; close(): Promise<void> }

/** Fixed CSV contract: columns never change order or name. New fields go to JSONL/Postgres, not here. */
export const CSV_HEADER = ["source", "source_id", "name", "phone", "website", "address", "lat", "lng", "niche"] as const;
const esc = (v: unknown) => { const s = v === undefined || v === null ? "" : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsvRow = (r: SourceRecord) =>
  [r.source, r.sourceId, r.name, r.phone, r.website, r.address, r.lat, r.lng, r.niche.join("|")].map(esc).join(",");

export class CsvSink implements Sink {
  private started = false;
  constructor(private path: string) {}
  async write(records: SourceRecord[]) {
    if (!this.started) { await mkdir(dirname(this.path), { recursive: true }); await writeFile(this.path, CSV_HEADER.join(",") + "\n"); this.started = true; }
    if (records.length) await appendFile(this.path, records.map(toCsvRow).join("\n") + "\n");
  }
  async close() { if (!this.started) await this.write([]); }
}
export class JsonlSink implements Sink {
  private started = false;
  constructor(private path: string) {}
  async write(records: SourceRecord[]) {
    if (!this.started) { await mkdir(dirname(this.path), { recursive: true }); await writeFile(this.path, ""); this.started = true; }
    if (records.length) await appendFile(this.path, records.map((r) => JSON.stringify(r)).join("\n") + "\n");
  }
  async close() { if (!this.started) await this.write([]); }
}
export class MemorySink implements Sink {
  records: SourceRecord[] = [];
  async write(r: SourceRecord[]) { this.records.push(...r); }
  async close() {}
}

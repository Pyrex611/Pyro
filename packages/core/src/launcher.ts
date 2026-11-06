import { randomUUID } from "node:crypto";
import type { SupabaseLike } from "./store";

export interface LaunchConfig {
  projectId: string; region: string; job: string;
  getAccessToken: () => Promise<string>; fetchImpl?: typeof fetch;
}
/** Create a queued run row, then start the Cloud Run Job with only RUN_ID passed (inputs live in Postgres). */
export async function launchRun(db: SupabaseLike, cfg: LaunchConfig, req: { source: string; input: unknown; implementation?: string }) {
  const runId = randomUUID();
  const ins = await db.from("runs").insert({ id: runId, source: req.source, implementation: req.implementation, input: req.input, status: "queued" });
  if (ins.error) throw new Error(`create run: ${ins.error.message}`);
  const url = `https://run.googleapis.com/v2/projects/${cfg.projectId}/locations/${cfg.region}/jobs/${cfg.job}:run`;
  try {
    const res = await (cfg.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: { authorization: `Bearer ${await cfg.getAccessToken()}`, "content-type": "application/json" },
      body: JSON.stringify({ overrides: { containerOverrides: [{ env: [{ name: "RUN_ID", value: runId }] }] } }),
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  } catch (e) {
    const msg = `launch failed: ${e instanceof Error ? e.message : e}`;
    await db.from("runs").update({ status: "failed", error: msg, finished_at: new Date().toISOString() }).eq("id", runId);
    throw new Error(msg);
  }
  return { runId };
}
export async function requestCancel(db: SupabaseLike, runId: string) {
  const r = await db.from("runs").update({ cancel_requested: true }).eq("id", runId);
  if (r.error) throw new Error(r.error.message);
}

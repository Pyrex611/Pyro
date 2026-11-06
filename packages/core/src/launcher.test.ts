import { describe, expect, it } from "vitest";
import { launchRun, requestCancel } from "./index";

const mkDb = () => { const log: any[] = []; return { log, from: (t: string) => ({ insert: async (v: any) => { log.push(["insert", t, v]); return { error: null }; }, update: (v: any) => ({ eq: async (_c: string, id: string) => { log.push(["update", v, id]); return { error: null }; } }) }) }; };
const cfg = (fetchImpl: any) => ({ projectId: "p", region: "us-central1", job: "gmaps-legacy", getAccessToken: async () => "tok", fetchImpl });

describe("launcher", () => {
  it("queues the run and passes only RUN_ID to the job", async () => {
    const db = mkDb(); let call: any;
    const { runId } = await launchRun(db, cfg(async (u: string, o: any) => { call = { u, o }; return { ok: true, status: 200, text: async () => "" }; }), { source: "gmaps", input: { city: "c" } });
    expect(call.u).toBe("https://run.googleapis.com/v2/projects/p/locations/us-central1/jobs/gmaps-legacy:run");
    expect(JSON.parse(call.o.body).overrides.containerOverrides[0].env).toEqual([{ name: "RUN_ID", value: runId }]);
    expect(call.o.headers.authorization).toBe("Bearer tok"); expect(db.log[0][2]).toMatchObject({ status: "queued", input: { city: "c" } });
  });
  it("marks the run failed when the launch is rejected", async () => {
    const db = mkDb();
    await expect(launchRun(db, cfg(async () => ({ ok: false, status: 403, text: async () => "denied" })), { source: "gmaps", input: {} })).rejects.toThrow(/403/);
    expect(db.log.at(-1)[1]).toMatchObject({ status: "failed" });
  });
  it("requests cancel", async () => { const db = mkDb(); await requestCancel(db, "r1"); expect(db.log[0][1]).toEqual({ cancel_requested: true }); });
});

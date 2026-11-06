# Lead platform

Platform-first lead sourcing for PyrexxAI. Every source is an independent adapter that can run alone (CLI) or under the platform.

## Run
```
npm install
npm test            # unit + contract tests
npm run typecheck
npm run lead -- run echo --input '{"count":10}' --out ./out --max 8
```
Output: `out/<runId>/echo.csv` (fixed header) and `echo.jsonl`.

## Layout
- `packages/core` — adapter contract, runner (budget guard, batching, cancel, partial flush), sinks (CSV, JSONL, Supabase), resolver v0, test kit.
- `packages/cli` — `lead run <source>`.
- `sources/echo` — reference adapter. Copy it to start a new source.
- `supabase/migrations` — schema, RLS, private `runs` storage bucket.

## Adding a source
1. Copy `sources/echo`; set `manifest.id` (kebab-case, equals `record.source`).
2. Implement `estimateCost` (declare cost units, e.g. `places.pro`) and `run` (async generator; check `ctx.signal`).
3. Add `checkAdapterContract(adapter, sampleInput)` to its tests.
4. Register it in `packages/cli/src/index.ts`.

## Conventions
- Budget is strict: a cost unit with no cap in `BUDGET_CAPS` has a zero allowance, so paid sources refuse to run until you set a cap.
- CSV header is a contract (`CSV_HEADER`); new fields go to JSONL/Postgres.
- Records failing the schema are counted (`invalid`), not fatal. Adapter errors flush partial results first.

## Pyro UI (`apps/web`)
The dashboard. Calls the deployed GMaps scraper over HTTP (never embeds its code) and stores results via a pluggable backend: local JSON/JSONL files by default, or Supabase automatically once `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set. See SETUP.md Section 14.
```
copy apps\web\.env.local.example apps\web\.env.local   # fill in GMAPS_SERVICE_URL
npm install
npm run dev:web
```

## Setup and deployment
Follow **SETUP.md** (granular, Windows CMD). Run `node scripts\check-state.mjs` first; it checks your local state and never prints secrets.
Do not run the old `deploy-scraper.bat`: it overwrites the Dockerfile, package.json and server.js with a placeholder stub.

## Phase 2.1 — GMaps as-is (`sources/gmaps`)
`scraper/` is a self-contained, deployable Node app (own package.json, Dockerfile, utils.js). `scraper.js` is your original logic (only `log`/`runScrape` exported, stdout logging added); `server.js` is the HTTP layer plus optional `SERVICE_TOKEN` auth; `job.js` is the Cloud Run Job entrypoint (reads input from the `runs` row by `RUN_ID`, scrapes, uploads `gmaps.csv` / `gmaps.jsonl` / `gmaps.raw.json` to the private `runs` bucket, upserts `raw_records`, heartbeats, honors `cancel_requested`).
Platform side: `launchRun()` (core) queues a run and starts the job with only `RUN_ID`; `createGmapsLegacy()` calls the HTTP `/scrape` for local runs: `GMAPS_SERVICE_URL=... npm run lead -- run gmaps --input '{"city":"Columbus, OH","keyword":"med spa"}'`.

Known limits of the as-is wrapper (fixed in 2.2): results only appear when the whole scrape ends, cancel discards partial work, Places spend cannot be metered (rely on GCP quota caps), overlapping grid with a 60-result cap per point, homepage-only website crawl. Emails live in the JSONL/Postgres `signals`, not the CSV contract.

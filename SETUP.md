# SETUP.md — pyro-lp lead platform (Windows CMD)

This is the full, step-by-step setup for everything that exists today: the platform core, the GMaps scraper as a Cloud Run Job, and Supabase storage. Follow it top to bottom. **Do not skip the checkpoints.** Each one tells you what you should see; if you see something else, stop and use Section 12 or send me the output.

**Not part of this guide yet:** the dashboard (Vercel) and the Places API (New) version of GMaps. They arrive in later phases with their own full guides.

## How to read this guide

- Every command is for **Command Prompt (CMD)**, not PowerShell. Open it from the Start menu by typing `cmd`.
- UPPERCASE words are placeholders you replace.
- A line ending in `^` continues on the next line. Do not add a space after `^`.
- CMD forgets variables when you close the window. Section 5.4 creates `scripts\env.cmd`, which you run in every new window.
- **Expected:** is what a correct result looks like. **STOP if:** is when to pause and fix.
- Never paste a secret key into this repo, an issue, or a chat. Keys live only in Secret Manager and a password manager.

## 0. Read this before touching anything

1. **Never run `deploy-scraper.bat`.** It rewrites `Dockerfile`, `package.json` and `server.js` with a placeholder stub, then deploys a public (`--allow-unauthenticated`) service. If you ever ran it in a folder, that folder's files were overwritten. Delete the file from this repo (Section 11).
2. **The scraper is JavaScript.** Its helper file must be `utils.js`, not `utils.py`.
3. **Scraper dependencies belong in `sources\gmaps\scraper\package.json`**, not the root `package.json`. The root one only defines workspaces and dev tools.
4. **Cost:** nothing here is free to run at scale. Place Details calls are billed. You will set quota caps and a budget alert (Section 6) before the first real run.
5. Free-tier limits (Supabase, Cloud Run, Cloud Build) change. Check each provider's pricing page when you create the account.

## 1. Accounts and tools

| What | Where | You need it for |
|---|---|---|
| GitHub account (repo `pyro-lp`) | github.com | Source control |
| Google account + Google Cloud billing account | console.cloud.google.com | Cloud Run, Maps APIs. Billing needs a card that allows international online payments; Google may place a small verification hold |
| Supabase account | supabase.com/dashboard (sign in with GitHub) | Database and file storage |
| Node.js 20 or newer (LTS) | nodejs.org | Everything |
| Git for Windows | git-scm.com | Source control |
| Google Cloud CLI | cloud.google.com/sdk/docs/install | Deploying |

After installing, **close CMD and open a new one**, then check:

```
node -v
npm -v
git --version
gcloud --version
```

**Expected:** Node `v20.x` or higher, npm a version number, git a version number, gcloud lists "Google Cloud SDK".
**STOP if:** any says "is not recognized". Reinstall that tool, then open a new CMD window.

## 2. Check your local state (gate)

I can't see your machine, so this script reports it. It is read-only and never prints secret values.

1. Open CMD and go to your repo. Use the real path:
   ```
   cd /d C:\PATH\TO\pyro-lp
   ```
2. Confirm you are in the right place:
   ```
   dir
   ```
   **Expected:** you see `SETUP.md`, `package.json`, `packages`, `sources`, `supabase`, `scripts`.
   **STOP if:** `scripts` or `SETUP.md` is missing. Extract the latest `lead-platform.zip` over the repo first (this adds the scraper `package.json`, `Dockerfile`, `utils.js`, `scripts\`, and this guide). Do not overwrite your own `utils.js` if it already works; the script below will tell you.
3. Run the check:
   ```
   node scripts\check-state.mjs
   ```
4. Read the result. Every line is `[PASS]`, `[WARN]`, `[FAIL]` or `[INFO]`.

**Expected:** `0 fail`. Warnings about missing `node_modules`, the lock file or `gcloud` are fine for now.

| If you see | Do this |
|---|---|
| `[FAIL] no utils.py` | Rename it, or replace it with the JavaScript file: `ren sources\gmaps\scraper\utils.py utils.js` only if the content is JavaScript. If it is Python, copy `utils.js` from the zip |
| `[FAIL] scraper dependencies are NOT in the root package.json` | Open the root `package.json`, delete the `dependencies` block you added, save |
| `[FAIL] server.js is the real HTTP layer` | `server.js` was overwritten by a stub. Restore it from the zip (`sources\gmaps\scraper\server.js`) |
| `[FAIL] no secrets inside tracked-style files` | A key is in a committed-style file. Remove it, rotate that key (Section 6), and tell me before continuing |
| `[FAIL] no .env ... tracked by git` | `git rm --cached PATH_OF_FILE`, then commit |

5. **Send me the full output of the check before you continue.** I will confirm the state and adjust this guide if your repo differs from what I expect.

## 3. Install and test locally

1. Root install:
   ```
   npm install
   ```
   **Expected:** ends with "added N packages". Warnings are fine.
2. Run the tests:
   ```
   npm test
   ```
   **Expected:** `Test Files  5 passed (5)` and `Tests  28 passed (28)`.
   **STOP if:** any test fails. Send me the failing output.
3. Type check:
   ```
   npm run typecheck
   ```
   **Expected:** no output at all.
4. Try the reference source:
   ```
   npm run lead -- run echo --input "{\"count\":10}" --out .\out --max 8
   ```
   **Expected:** a JSON summary with `"status": "succeeded"` and `"records": 8`, and files under `out\<some-uuid>\` (`echo.csv`, `echo.jsonl`).
5. Install the scraper's own dependencies (this also creates its lock file, which the Docker build needs):
   ```
   cd sources\gmaps\scraper
   set PUPPETEER_SKIP_DOWNLOAD=true
   npm install
   cd ..\..\..
   ```
   **Expected:** a `node_modules` folder and `package-lock.json` inside `sources\gmaps\scraper`.
6. Re-run `node scripts\check-state.mjs`. **Expected:** `0 fail`, and the two `node_modules` warnings are gone.

## 4. Supabase

1. Go to https://supabase.com/dashboard and sign in.
2. **New project.** Organization: your personal one. Name: `pyro-lp`. Database password: click **Generate**, then copy it into your password manager (you cannot view it again). Region: a US region (East US is fine). Plan: Free.
3. Click **Create new project** and wait until the dashboard finishes loading (about 2 minutes).
4. Get your keys: **Project Settings** (gear icon) → **API** (it may be called **API Keys** or **Data API**; the UI changes).
   - Copy **Project URL** (looks like `https://abcdxyz.supabase.co`). You will put it in `scripts\env.cmd` later.
   - Copy the **service_role** key (or the new **secret** key). Save it in your password manager. This key bypasses all security rules; only the job uses it.
5. Create the schema: left menu → **SQL Editor** → **New query**.
   - Open `supabase\migrations\0001_init.sql` in Notepad, select all, copy.
   - Paste into the SQL Editor and click **Run**.
   **Expected:** "Success. No rows returned."
6. Verify tables: left menu → **Table Editor**. **Expected:** `runs`, `raw_records`, `entities`, `entity_sources`, `contacts`, `signals`, `scores`, `suppression`.
7. Verify storage: left menu → **Storage**. **Expected:** a bucket named `runs`, not public.
   If it is missing: **New bucket** → name `runs` → leave "Public bucket" off → Create.

**STOP if:** the SQL run shows an error. Copy the message to me.

## 5. Google Cloud: project, billing, CLI

### 5.1 Create a dedicated project

I recommend a new project instead of reusing `midas-pyrex`: separate quotas, billing alerts and API keys, and it keeps Midas isolated.

1. Go to https://console.cloud.google.com.
2. Click the project picker at the top → **New project**.
3. Project name: `pyro-lp`. **Project ID:** edit it to something unique such as `pyro-lp-4821` (IDs are global and permanent). Write it down.
4. Create, then make sure the new project is selected in the picker.

### 5.2 Link billing

1. Left menu → **Billing**. If asked, **Link a billing account** (create one with your card if you have none).
2. **Expected:** the project shows a billing account name.

### 5.3 Sign in with the CLI

```
gcloud auth login
```
A browser opens; sign in with the same Google account. Then:
```
gcloud config set project YOUR_PROJECT_ID
gcloud config list
```
**Expected:** `project = YOUR_PROJECT_ID`.

### 5.4 Create your environment file

```
copy scripts\env.example.cmd scripts\env.cmd
notepad scripts\env.cmd
```
Fill in `PROJECT_ID` and `SUPABASE_URL`. Leave `PROJECT_NUM` for now. Save. Then load it (do this in every new CMD window):
```
scripts\env.cmd
```
**Expected:** `Loaded: project=... region=us-central1 job=gmaps-legacy`.

### 5.5 Enable APIs and find your project number

```
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com iam.googleapis.com
```
This takes a minute. Then get the project number:
```
gcloud projects describe %PROJECT_ID% --format="value(projectNumber)"
```
Put that number into `PROJECT_NUM` in `scripts\env.cmd`, save, and run `scripts\env.cmd` again.

Now enable the two Maps APIs in the UI: left menu → **APIs & Services → Library**. Search **Geocoding API** → **Enable**. Search **Places API** (the original one, not "Places API (New)") → **Enable**.

**Expected:** both appear under **APIs & Services → Enabled APIs & services**.

## 6. Google Maps key, quotas, budget (security hotfix)

### 6.1 Create a restricted key

1. **APIs & Services → Credentials → Create credentials → API key.**
2. Click the new key's name → rename to `pyro-lp-maps-key`.
3. Under **API restrictions** choose **Restrict key** and tick **Geocoding API** and **Places API**. Leave application restrictions off (Cloud Run has no fixed IP). **Save.**
4. Click **Show key** and copy it into your password manager. Do not paste it into CMD.

### 6.2 Cap usage

1. Left menu → **Google Maps Platform → Quotas** (if you cannot find it: APIs & Services → Enabled APIs → Places API → Quotas & System Limits).
2. For **Places API** and **Geocoding API**, set the daily request quota to a low number while testing, for example 500 per day.
   The exact quota names vary; choose the per-day request limit if shown, otherwise the lowest per-minute limit.

### 6.3 Budget alert

1. **Billing → Budgets & alerts → Create budget.**
2. Name: `pyro-lp`. Scope: this project. Amount: for example $10. Add alerts at 50%, 90%, 100%. Make sure email notifications go to you.
3. A budget **alerts**, it does not stop spending. The quotas above are your real brake.

### 6.4 Retire the old key

If the old scraper key ever appeared in a committed `.env.example`, delete it: open the project that owns it (`midas-pyrex`) → **APIs & Services → Credentials** → delete the old key. If that repo was ever pushed, also purge it from git history (Section 11).

## 7. Secrets, service account, permissions

### 7.1 Store secrets

1. Left menu → **Security → Secret Manager** (enable it if prompted).
2. **Create secret.** Name: `google-api-key`. Secret value: paste the Maps key. Create.
3. **Create secret.** Name: `supabase-service-key`. Secret value: paste the Supabase service_role (or secret) key. Create.

### 7.2 Create the job's service account

```
gcloud iam service-accounts create %SA_NAME% --display-name="Lead platform jobs"
gcloud secrets add-iam-policy-binding google-api-key --member=serviceAccount:%SA_EMAIL% --role=roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding supabase-service-key --member=serviceAccount:%SA_EMAIL% --role=roles/secretmanager.secretAccessor
```
**Expected:** each command prints an updated policy containing your service account.

### 7.3 Allow builds from source

New projects give the build service account no roles, so the first source deploy fails without this:

```
gcloud projects add-iam-policy-binding %PROJECT_ID% --member=serviceAccount:%BUILD_SA% --role=roles/run.builder
```
Wait about 2 minutes for it to take effect.

## 8. Deploy the job

1. Go to the scraper folder:
   ```
   cd sources\gmaps\scraper
   ```
2. Deploy:
   ```
   gcloud run jobs deploy %JOB_NAME% ^
     --source . ^
     --region %REGION% ^
     --service-account %SA_EMAIL% ^
     --tasks 1 --max-retries 0 --task-timeout 3h ^
     --memory 4Gi --cpu 2 ^
     --command node --args job.js ^
     --set-env-vars SUPABASE_URL=%SUPABASE_URL%,GRID_SEARCH_ENABLED=true,FALLBACK_SCRAPING_ENABLED=true ^
     --set-secrets GOOGLE_API_KEY=google-api-key:latest,SUPABASE_SERVICE_ROLE_KEY=supabase-service-key:latest
   ```
   If it asks to create an Artifact Registry repository, answer **Y**. The first build takes 5 to 10 minutes.
   `--max-retries 0` is deliberate: a retry would repeat paid Places calls.
3. **Expected:** `Job [gmaps-legacy] has successfully been deployed.`
4. Go back to the repo root:
   ```
   cd ..\..\..
   ```

**If gcloud rejects `--source` for jobs**, build the image yourself, then deploy it:
```
gcloud artifacts repositories create lp --repository-format=docker --location=%REGION%
gcloud builds submit sources\gmaps\scraper --tag %REGION%-docker.pkg.dev/%PROJECT_ID%/lp/%JOB_NAME%
gcloud run jobs deploy %JOB_NAME% --image %REGION%-docker.pkg.dev/%PROJECT_ID%/lp/%JOB_NAME% --region %REGION% --service-account %SA_EMAIL% --tasks 1 --max-retries 0 --task-timeout 3h --memory 4Gi --cpu 2 --command node --args job.js --set-env-vars SUPABASE_URL=%SUPABASE_URL%,GRID_SEARCH_ENABLED=true,FALLBACK_SCRAPING_ENABLED=true --set-secrets GOOGLE_API_KEY=google-api-key:latest,SUPABASE_SERVICE_ROLE_KEY=supabase-service-key:latest
```

## 9. Smoke test (small and cheap)

1. In Supabase **SQL Editor → New query**, run:
   ```sql
   insert into runs (source, input, status)
   values ('gmaps', '{"city":"Columbus, OH","keyword":"med spa","radius":3000,"areas":["Short North"]}', 'queued')
   returning id;
   ```
   Copy the `id` it returns. One area keeps this to a single search point, about 60 places at most.
2. In CMD (with `scripts\env.cmd` loaded):
   ```
   gcloud run jobs execute %JOB_NAME% --region %REGION% --update-env-vars RUN_ID=THE_UUID --wait
   ```
   If your gcloud rejects `--update-env-vars` on the GA command, use `gcloud beta run jobs execute` with the same arguments.
3. **Expected:** the command waits a few minutes, then reports the execution completed.
4. Verify in Supabase:
   - **Table Editor → `runs`:** your row has `status = succeeded`, `records` greater than 0, and `artifacts` listing three files.
   - **Table Editor → `raw_records`:** rows for that run id.
   - **Storage → `runs` → THE_UUID:** `gmaps.csv`, `gmaps.jsonl`, `gmaps.raw.json`. Download `gmaps.csv` and open it in Excel.
5. **Logs:** Cloud Console → **Cloud Run → Jobs → gmaps-legacy → Executions →** your execution → **Logs**.
6. **Cancel test (optional):** insert another run, execute it without `--wait`, then in SQL run `update runs set cancel_requested = true where id = 'THE_UUID';`. Within about 15 seconds the run shows `canceled`.
7. **Clean up the test:** `delete from runs where id = 'THE_UUID';` removes its `raw_records` too. Delete its folder in Storage by hand.

**STOP if:** the status is `failed`. Read the `error` column and the logs, then see Section 12.

## 10. The old service in `midas-pyrex` (decide, then act)

The old deploy script created a Cloud Run service called `gmaps-scraper` and a bucket `midas-pyrex-scraper-output`. It deployed a placeholder that scrapes nothing, and it was public.

1. See what exists:
   ```
   gcloud run services list --project midas-pyrex
   gcloud storage ls --project midas-pyrex
   ```
2. **Before deleting anything**, check whether Midas or anything else calls that service URL. Search your Midas code and settings for `gmaps-scraper` and the service URL.
3. Remove public access:
   ```
   gcloud run services remove-iam-policy-binding gmaps-scraper --member=allUsers --role=roles/run.invoker --region us-central1 --project midas-pyrex
   ```
4. Once you are sure nothing uses it:
   ```
   gcloud run services delete gmaps-scraper --region us-central1 --project midas-pyrex
   ```
5. Inspect the bucket contents before deciding to delete it.

## 11. Git hygiene and commit

1. Delete the dangerous script and leftovers if present:
   ```
   del deploy-scraper.bat
   del sources\gmaps\scraper\deploy-scraper.bat
   ```
   (An error saying the file is not found is fine.)
2. **If the old scraper repo was ever pushed with a real key in `.env.example`,** purge it from that repo's history:
   ```
   pip install git-filter-repo
   echo THE_OLD_KEY==>REMOVED> replacements.txt
   git filter-repo --replace-text replacements.txt
   git remote add origin YOUR_REPO_URL
   git push --force
   ```
   Then delete `replacements.txt`. Treat the old key as burned either way.
3. Check what would be committed:
   ```
   node scripts\check-state.mjs
   git status
   ```
   **Expected:** `0 fail`. `git status` must not list `.env`, `server.log`, `scripts\env.cmd` or `node_modules`.
4. Commit and push:
   ```
   git add .
   git commit -m "Phase 1 core, Phase 2.1 GMaps job, setup guide"
   git push
   ```

## 12. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `PERMISSION_DENIED ... default service account is missing required IAM permissions` on deploy | Section 7.3 not applied or not yet propagated. Re-run it and wait 2 minutes |
| `REQUEST_DENIED` in logs | The key's API restrictions don't include Geocoding/Places, or the APIs are not enabled (Section 5.5, 6.1) |
| Job can't read a secret | Section 7.2 bindings missing, or the secret name differs from `google-api-key` / `supabase-service-key` |
| Chrome crashes or `Target closed` | Memory too low. Keep `--memory 4Gi`. Check `FALLBACK_SCRAPING_ENABLED` |
| `upload gmaps.csv: ...` error | `runs` bucket missing or misnamed (Section 4.7) |
| `run ... not found` | The `RUN_ID` you passed doesn't exist in `runs`, or the wrong Supabase project URL |
| Run stuck `running` | Job died without updating. Check logs, then `update runs set status='failed' where id='...'` |
| `Unknown argument` or odd CMD errors | A space after `^`, pasted line breaks, or unloaded variables. Run `scripts\env.cmd` and retype |
| `npm ci` fails during the Docker build | The scraper's `package-lock.json` is out of sync. Run `npm install` in `sources\gmaps\scraper`, commit the lock, redeploy |
| Tests pass locally but fail after an update | Run `npm install` again at root; the workspace links may be stale |

## 13. Updating the platform (standard procedure)

Every future update ships with its own guide. The skeleton is always:

1. Commit or stash your local work: `git status`.
2. Extract the new zip over the repo, or copy only the files I list.
3. `npm install`, then `npm test` and `npm run typecheck`. Stop if anything fails.
4. `node scripts\check-state.mjs`. Stop on any `[FAIL]`.
5. Run any new SQL file from `supabase\migrations\` in the Supabase SQL Editor, **in numeric order**.
6. If scraper files changed, redeploy with the Section 8 command.
7. Run the Section 9 smoke test.
8. Commit and push.

**Rollback:** list recent images in **Cloud Console → Artifact Registry**, then:
```
gcloud run jobs update %JOB_NAME% --region %REGION% --image PREVIOUS_IMAGE_URL
```
SQL migrations are not auto-reversible; each one I ship will include its own undo script.

## Appendix: scraper environment variables

| Variable | Where it comes from | Meaning |
|---|---|---|
| `GOOGLE_API_KEY` | Secret Manager `google-api-key` | Maps key |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret Manager `supabase-service-key` | Server-side Supabase key |
| `SUPABASE_URL` | Job env var | Project URL |
| `RUN_ID` | Set per execution | Row in `runs` to process |
| `GRID_SEARCH_ENABLED`, `GRID_POINTS` | Job env var | Grid search toggle and point count |
| `FALLBACK_SCRAPING_ENABLED` | Job env var | Website crawl via Puppeteer |
| `MAX_CONCURRENT_SCRAPES` | Optional | Enrichment batch size (default 5) |
| `SERVICE_TOKEN` | Optional, HTTP service only | Bearer token for `/scrape` |

---

## 14. Pyro UI (`apps/web`) — setup and run

This adds the Next.js dashboard, "Pyro." It works with **no Supabase credentials**: without them it stores runs and leads as local JSON/JSONL files under `apps\web\.data\`. Supabase becomes the backend automatically the moment both its env vars are set — no code change, no flag to flip.

**What Pyro does, concretely:** it calls the already-deployed GMaps scraper's `/scrape` endpoint over plain HTTP and stores what comes back. It does not contain the scraper's code — that still lives only in `sources\gmaps\scraper\` and runs wherever you deployed it (Section 8). If that deployment is still the Section 11 stub (0 results, no real scraping), Pyro will run successfully but return 0 leads; that's expected, not a Pyro bug. Deploy the real scraper per Section 8 first if you haven't.

### 14.1 Re-run the state check

```
cd /d C:\PATH\TO\pyro-lp
node scripts\check-state.mjs
```
**Expected:** `0 fail`. New checks cover `apps\web`: files present, workspaces includes `apps/*`, its dependency on `@leads/core` / `@leads/source-gmaps`, and whether it's been installed/built. `[WARN] apps/web/.env.local present` is expected before step 14.2.

### 14.2 Configure

```
copy apps\web\.env.local.example apps\web\.env.local
notepad apps\web\.env.local
```
Fill in `GMAPS_SERVICE_URL` with the scraper's Cloud Run **service** URL (not the Job — Pyro calls the HTTP service directly; if you only deployed the Job from Section 8, also deploy the service, same source, with `gcloud run deploy`, `--no-allow-unauthenticated`, no `--command`/`--args` override so it defaults to `node server.js`; put its auth token, if you set `SERVICE_TOKEN` on it, in `GMAPS_SERVICE_TOKEN`). Leave `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` blank for now. Save.

### 14.3 Install and run

```
npm install
npm run dev:web
```
**Expected:** `Local: http://localhost:3000`. Open it in a browser.

**Checkpoints:**
- **Overview** loads with a KPI row. If `GMAPS_SERVICE_URL` is blank, an amber banner appears at the top of every page; a second banner says runs are stored locally.
- **Sources** shows GMaps as Active, five others as Planned (disabled).
- **Sources → GMaps:** fill City/State and keyword, click **Start run**. Status moves queued → running → succeeded (or failed, with the scraper's error shown verbatim). On success, **Download CSV** / **Download JSONL** appear.
- **Runs** lists it; opening it shows the same detail plus a Cancel button while it's running.
- **Leads** shows the resolved entities (deduped by phone/domain/address) with a niche filter, a has-website filter, search, a drawer with signals and provenance, and a client-side **Export CSV**.
- **Settings** shows every config flag's live status (values never shown) and which storage backend is active.

**STOP if:** a page errors. Send me the browser console error and the terminal output from `npm run dev:web`.

### 14.4 I already verified the mechanics

Using a local mock HTTP endpoint standing in for the real scraper, I confirmed, against a real running build (not just code review): a run reaches `succeeded` with the right record count; signals (rating, review count, no-website flag, emails, socials) come through correctly; CSV and JSONL downloads match; `/api/leads` correctly dedupes two listings into two distinct entities; cancel sets the flag; a missing run returns 404; every page returns 200; and the file store writes `runs.json` and one JSONL per run under `.data\`. I also caught and fixed a real bug this way: Next.js statically pre-rendered a couple of routes at build time, baking in whatever env existed at that moment instead of reading it live — `dynamic = "force-dynamic"` is now set on every route/page that reads config or the store. **I have not tested it against your actual deployed scraper** — do that in 14.3.

### 14.5 Production build (optional now)

```
npm run build:web
npm run start --workspace apps/web
```
This is a real Node server (not a serverless function) — see the limitation below before deploying it anywhere that tears down idle processes.

### 14.6 Known limits (by design, for this phase)

- **A run executes inside the Node process serving Pyro.** This is correct for `next dev` or a single, always-on `next start`, and is exactly why Vercel isn't wired up yet: a serverless function would be killed mid-scrape. Don't deploy `apps\web` to Vercel until a later phase moves run execution to the Cloud Run Job dispatch already built in `packages/core` (`launchRun`).
- **File storage is single-process.** Fine for one person running it locally; switch to Supabase (fill in both env vars) before more than one person uses it, or before running it anywhere that can restart or scale to multiple instances.
- **Cancel on GMaps is best-effort**, same reason as documented in Section 14: the legacy scraper returns all results in one HTTP response, so cancellation can only take effect once that response arrives.
- **Git check still applies:** before committing, re-run `node scripts\check-state.mjs` and confirm `.env.local` and `.data\` are not tracked (`apps\web\.gitignore` already excludes both).

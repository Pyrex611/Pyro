-- Pyro Lead Platform — Neon PostgreSQL DDL Migration
-- Consolidated single-source-of-truth schema: runs, raw_records, leads, lead_sources, suppression, exports, audit_log

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Execution Runs Table
CREATE TABLE IF NOT EXISTS runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id TEXT NOT NULL,
  input JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'normalizing', 'deduping', 'succeeded', 'failed', 'canceled')),
  records_raw INT NOT NULL DEFAULT 0,
  records_deduped INT NOT NULL DEFAULT 0,
  spend JSONB NOT NULL DEFAULT '{}',
  error TEXT,
  heartbeat_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_runs_status_created ON runs(status, created_at DESC);

-- 2. Immutable Raw Records Captured from Scrapers
CREATE TABLE IF NOT EXISTS raw_records (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, source_id, source_ref)
);

CREATE INDEX IF NOT EXISTS idx_raw_records_lookup ON raw_records(source_id, source_ref);

-- 3. Canonical Resolved Healthcare Leads
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  niche TEXT NOT NULL,
  phone_e164 TEXT,
  email TEXT,
  website TEXT,
  domain TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  npi TEXT,
  decision_maker JSONB NOT NULL DEFAULT '{}',
  signals JSONB NOT NULL DEFAULT '[]',
  score INT NOT NULL DEFAULT 50,
  score_reasons JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'qualified', 'exported', 'suppressed', 'rejected')),
  dedupe_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_dedupe_key ON leads(dedupe_key);
CREATE INDEX IF NOT EXISTS idx_leads_score_status ON leads(score DESC, status);
CREATE INDEX IF NOT EXISTS idx_leads_niche ON leads(niche);
CREATE INDEX IF NOT EXISTS idx_leads_city_state ON leads(city, state);
CREATE INDEX IF NOT EXISTS idx_leads_domain ON leads(domain) WHERE domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone_e164) WHERE phone_e164 IS NOT NULL;

-- 4. Field-Level Provenance & Confidence Ledger
CREATE TABLE IF NOT EXISTS lead_sources (
  id BIGSERIAL PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  confidence_tier TEXT NOT NULL DEFAULT 'LOW' CHECK (confidence_tier IN ('HIGH', 'MEDIUM', 'LOW')),
  fields_provided JSONB NOT NULL DEFAULT '[]',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lead_id, source_id, source_ref)
);

CREATE INDEX IF NOT EXISTS idx_lead_sources_lead ON lead_sources(lead_id);

-- 5. Global Compliance & Suppression List
CREATE TABLE IF NOT EXISTS suppression (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('email', 'domain', 'phone')),
  value TEXT NOT NULL UNIQUE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suppression_lookup ON suppression(kind, value);

-- 6. Export Dispatch History (Midas, CRM, CSV)
CREATE TABLE IF NOT EXISTS exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target TEXT NOT NULL CHECK (target IN ('midas', 'crm', 'csv')),
  lead_ids UUID[] NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  response JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Audit Logging
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'system',
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
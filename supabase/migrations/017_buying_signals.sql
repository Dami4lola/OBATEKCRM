-- ============================================
-- MIGRATION 017: BUYING SIGNALS FROM JOB POSTS
-- Safe to run more than once. Run after 016_agency_enterprise.sql.
--
-- Fewer, better leads: small companies hiring an appointment setter, SDR,
-- lead-gen specialist, CRM admin or GoHighLevel person need what OBATEK
-- sells right now. A daily pull from TheirStack's job API (its terms allow
-- B2B prospecting; leads it supplies are tagged lead_source 'theirstack'),
-- a Claude fit check, then the usual audit, draft and review.
-- See OUTREACH_PLAN.md §3 and §8. No scraping of Indeed or LinkedIn;
-- LinkedIn messages are drafted, never sent.
-- ============================================

-- One row per job post seen, fit or not, so the same post is never
-- bought or judged twice
CREATE TABLE IF NOT EXISTS lead_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('theirstack', 'manual')),
  external_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'job_post' CHECK (kind IN ('job_post')),
  region TEXT,
  job_title TEXT NOT NULL,
  matched_term TEXT,
  job_url TEXT,
  posted_at DATE,
  location TEXT,
  state_code TEXT,
  country_code TEXT,
  company_name TEXT,
  company_domain TEXT,
  company_linkedin_url TEXT,
  employee_count INT,
  industry TEXT,
  hiring_team JSONB NOT NULL DEFAULT '[]',
  excerpt TEXT,
  fit TEXT NOT NULL DEFAULT 'pending' CHECK (fit IN ('pending', 'fit', 'not_fit')),
  fit_target TEXT CHECK (fit_target IN ('agency', 'trades', 'dealer', 'other')),
  fit_reason TEXT,
  fit_checked_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'lead_created', 'matched_existing', 'discarded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_signals_created ON lead_signals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_signals_lead ON lead_signals(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_signals_domain ON lead_signals(company_domain);

ALTER TABLE lead_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can manage lead signals" ON lead_signals;
CREATE POLICY "Team members can manage lead signals"
  ON lead_signals FOR ALL
  TO authenticated
  USING (is_team_member())
  WITH CHECK (is_team_member());

-- TheirStack's terms: leads it supplies carry it as their source
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'leads'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%lead_source%'
  LOOP
    EXECUTE format('ALTER TABLE leads DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE leads ADD CONSTRAINT leads_lead_source_check
  CHECK (lead_source IN ('places', 'lusha', 'import', 'manual', 'referral', 'other', 'theirstack'));

-- New angle: the job post itself
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'outreach_emails'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%primary_hook%'
  LOOP
    EXECUTE format('ALTER TABLE outreach_emails DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE outreach_emails ADD CONSTRAINT outreach_emails_primary_hook_check
  CHECK (primary_hook IN (
    'no_site', 'no_booking', 'request_only', 'not_mobile', 'slow', 'outdated', 'seo_local', 'generic', 'job_post'
  ));

-- A LinkedIn note drafted alongside the email, copied and sent by hand
ALTER TABLE outreach_emails ADD COLUMN IF NOT EXISTS linkedin_draft TEXT;

-- Where and what to pull. Each region is one TheirStack search a day;
-- daily_jobs is the most it can return (1 credit each). Location ids are
-- looked up from TheirStack's catalog on the first pull and cached in
-- signal_location_ids.
INSERT INTO outreach_settings (key, value) VALUES
  ('signal_roles', '["appointment setter", "sales development representative", "SDR", "lead generation specialist", "CRM administrator", "GoHighLevel"]'::jsonb),
  ('signal_regions', $json$[
    {
      "key": "us",
      "name": "US target states",
      "country": "US",
      "places": [
        {"name": "New York", "state_code": "NY"},
        {"name": "Florida", "state_code": "FL"},
        {"name": "Texas", "state_code": "TX"},
        {"name": "Illinois", "state_code": "IL"},
        {"name": "Georgia", "state_code": "GA"},
        {"name": "North Carolina", "state_code": "NC"},
        {"name": "South Carolina", "state_code": "SC"}
      ],
      "extra_roles": [],
      "daily_jobs": 30
    },
    {
      "key": "ottawa",
      "name": "Ottawa area",
      "country": "CA",
      "places": [{"name": "Ottawa", "near": [45.4215, -75.6972], "radius_km": 60}],
      "extra_roles": ["dispatcher", "office administrator"],
      "daily_jobs": 10
    }
  ]$json$::jsonb),
  ('signal_location_ids', '{}'::jsonb),
  ('signal_max_age_days', '3'::jsonb),
  ('signal_staff_range', '[2, 20]'::jsonb),
  ('signal_pull_hour', '7'::jsonb),
  ('signal_fit_model', '"claude-haiku-5-5"'::jsonb),
  ('signals_pulled_at', 'null'::jsonb)
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';

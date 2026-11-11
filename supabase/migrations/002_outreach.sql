-- ============================================
-- MIGRATION 002: OUTREACH
-- Safe to run on an existing database (does not drop anything).
-- Run this in Supabase SQL Editor after 001_meetings.sql.
--
-- The "Run outreach" pop-up gathers leads in the New stage, emails them
-- through Instantly and moves them to Contacted. See OUTREACH_PLAN.md.
-- ============================================

-- ============================================
-- STEP 1: NEW COLUMNS ON EXISTING TABLES
-- ============================================

-- Lead details used by the site audit, compliance check and copywriter
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS country CHAR(2),
  ADD COLUMN IF NOT EXISTS vertical TEXT,
  ADD COLUMN IF NOT EXISTS staff_size INT,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS email_source TEXT
    CHECK (email_source IN ('website', 'lusha', 'manual', 'referral', 'other'));

-- Event details for outreach entries on the lead timeline
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Stops the same Instantly event being logged twice when stats are polled
CREATE UNIQUE INDEX IF NOT EXISTS idx_activities_external_id
  ON activities((meta->>'external_id')) WHERE meta ? 'external_id';
CREATE INDEX IF NOT EXISTS idx_activities_lead_created ON activities(lead_id, created_at DESC);

-- ============================================
-- STEP 2: NEW TABLES
-- ============================================

-- One per click of "Run now" or per scheduled run
CREATE TABLE IF NOT EXISTS outreach_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN (
    'scheduled', 'preparing', 'awaiting_review', 'sending',
    'completed', 'failed', 'cancelled'
  )),
  mode TEXT NOT NULL DEFAULT 'manual' CHECK (mode IN ('manual', 'auto')),
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outreach_runs_due ON outreach_runs(status, scheduled_for);

-- One per lead per run. Doubles as the learning set: stats are polled
-- from Instantly and the best performers are marked is_example.
CREATE TABLE IF NOT EXISTS outreach_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  run_id UUID REFERENCES outreach_runs(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'blocked', 'draft', 'approved', 'sent', 'failed', 'skipped'
  )),
  blocked_reason TEXT,
  audit JSONB NOT NULL DEFAULT '{}'::jsonb,
  primary_hook TEXT CHECK (primary_hook IN (
    'no_site', 'no_booking', 'not_mobile', 'slow', 'outdated', 'seo_local', 'generic'
  )),
  -- [{ "step": 1, "subject": "...", "body": "..." }, ...] for steps 1-3
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  author TEXT CHECK (author IN ('human', 'claude', 'claude_edited')),
  model TEXT,
  instantly_campaign_id TEXT,
  instantly_lead_id TEXT,
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  open_count INT NOT NULL DEFAULT 0,
  replied_at TIMESTAMPTZ,
  reply_class TEXT CHECK (reply_class IN (
    'interested', 'not_now', 'wrong_person', 'unsubscribe', 'out_of_office', 'other'
  )),
  bounced_at TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  is_example BOOLEAN NOT NULL DEFAULT FALSE,
  stats_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (run_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_outreach_emails_lead ON outreach_emails(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_emails_status ON outreach_emails(status);
CREATE INDEX IF NOT EXISTS idx_outreach_emails_sent ON outreach_emails(sent_at DESC) WHERE sent_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outreach_emails_examples ON outreach_emails(created_at DESC) WHERE is_example;

-- Never contact again
CREATE TABLE IF NOT EXISTS suppression_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  domain TEXT,
  reason TEXT NOT NULL CHECK (reason IN ('unsubscribe', 'hard_bounce', 'spam_complaint', 'manual')),
  added_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (email IS NOT NULL OR domain IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_suppression_email
  ON suppression_list(lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppression_domain
  ON suppression_list(lower(domain)) WHERE domain IS NOT NULL;

-- Switches editable without code changes
CREATE TABLE IF NOT EXISTS outreach_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO outreach_settings (key, value) VALUES
  ('source_stage_name',        '"New"'::jsonb),
  ('target_stage_name',        '"Contacted"'::jsonb),
  ('mode',                     '"manual"'::jsonb),
  ('sending_paused',           'true'::jsonb),   -- flip to false after warm-up
  ('daily_send_cap',           '20'::jsonb),
  ('send_window',              '{"start":"08:30","end":"16:30","weekdays_only":true}'::jsonb),
  ('resequence_cooldown_days', '180'::jsonb),
  ('auto_unlock_min_sends',    '50'::jsonb),
  ('auto_unlock_open_rate',    '0.5'::jsonb),
  ('example_min_sends',        '10'::jsonb),
  ('example_max_in_prompt',    '5'::jsonb),
  ('instantly_campaigns',      '{}'::jsonb),     -- { "hvac": "<campaign id>", "default": "<campaign id>" }
  ('offer_description',        '"OBATEK builds simple software for trades and service businesses: online quoting and booking, job tracking, scheduling, and AI phone answering, so owners stop losing jobs to missed calls and paperwork."'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- STEP 3: TRIGGERS
-- ============================================

-- Same helper as supabase-setup.sql; recreated here in case it is missing
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_outreach_runs_updated_at ON outreach_runs;
CREATE TRIGGER update_outreach_runs_updated_at
  BEFORE UPDATE ON outreach_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_outreach_emails_updated_at ON outreach_emails;
CREATE TRIGGER update_outreach_emails_updated_at
  BEFORE UPDATE ON outreach_emails
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_outreach_settings_updated_at ON outreach_settings;
CREATE TRIGGER update_outreach_settings_updated_at
  BEFORE UPDATE ON outreach_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- STEP 4: ROW LEVEL SECURITY
-- The local scheduler uses the service-role key (bypasses RLS).
-- The dashboard can manage runs and drafts and change settings,
-- but can only add to the suppression list, never remove from it.
-- ============================================

ALTER TABLE outreach_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppression_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage outreach runs" ON outreach_runs;
CREATE POLICY "Authenticated users can manage outreach runs"
  ON outreach_runs FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can manage outreach emails" ON outreach_emails;
CREATE POLICY "Authenticated users can manage outreach emails"
  ON outreach_emails FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can read suppression list" ON suppression_list;
CREATE POLICY "Authenticated users can read suppression list"
  ON suppression_list FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can add suppressions" ON suppression_list;
CREATE POLICY "Authenticated users can add suppressions"
  ON suppression_list FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can read outreach settings" ON outreach_settings;
CREATE POLICY "Authenticated users can read outreach settings"
  ON outreach_settings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can update outreach settings" ON outreach_settings;
CREATE POLICY "Authenticated users can update outreach settings"
  ON outreach_settings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Make the new tables visible to the Supabase API immediately
NOTIFY pgrst, 'reload schema';

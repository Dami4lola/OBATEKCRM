-- ============================================
-- MIGRATION 004: SOURCING, SCORING INPUTS, CALL TASKS
-- Safe to run more than once. Run after 003_team_access.sql.
--
-- "Find leads" pulls businesses from Google Places into the New stage.
-- Scores are computed in the app from these fields (not stored), so they
-- never go stale when a lead is edited. See OUTREACH_PLAN.md §3, §4, §10.
-- ============================================

-- ============================================
-- STEP 1: LEADS
-- ============================================

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS lead_source TEXT
    CHECK (lead_source IN ('places', 'lusha', 'import', 'manual', 'referral', 'other')),
  ADD COLUMN IF NOT EXISTS google_place_id TEXT,
  ADD COLUMN IF NOT EXISTS google_rating NUMERIC(2,1),
  ADD COLUMN IF NOT EXISTS google_review_count INT,
  ADD COLUMN IF NOT EXISTS owner_name TEXT,
  -- Pain signals found so far: { "no_site": true, "checked_at": "...", ... }
  ADD COLUMN IF NOT EXISTS signals JSONB NOT NULL DEFAULT '{}'::jsonb;

-- The same business is never sourced twice
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_google_place_id
  ON leads(google_place_id) WHERE google_place_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_lead_source_created
  ON leads(lead_source, created_at DESC);

-- ============================================
-- STEP 2: CALL TASKS
-- ============================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'general'
    CHECK (kind IN ('general', 'call'));

CREATE INDEX IF NOT EXISTS idx_tasks_kind_status_due
  ON tasks(kind, status, due_date);

-- ============================================
-- STEP 3: SETTINGS
-- ============================================

INSERT INTO outreach_settings (key, value) VALUES
  ('score_weights',          '{"pain_signal":3,"staff_size":2,"owner_reachable":2,"target_vertical":1}'::jsonb),
  ('score_threshold',        '5'::jsonb),        -- placeholder; open question in the Build Plan
  ('target_verticals',       '["handyman"]'::jsonb),
  ('call_list_size',         '3'::jsonb),
  ('auto_unlock_min_days',   '14'::jsonb),
  ('places_max_results',     '60'::jsonb),       -- per search (Places returns 20 per page)
  ('places_daily_lead_cap',  '200'::jsonb)       -- new Places leads per day, a cost guard
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';

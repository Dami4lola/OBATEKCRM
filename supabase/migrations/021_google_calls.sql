-- ============================================
-- MIGRATION 021: LIMITS ON GOOGLE CALLS
-- Safe to run more than once. Run after 020_mailbox_update.sql.
--
-- One row per paid Google call, written before the call is made, so the
-- per-minute, daily and monthly limits count what Google counts. The old
-- cap only counted leads added, so a search full of duplicates was free
-- as far as the app could tell. See OUTREACH_PLAN.md §16 S7.
-- ============================================

CREATE TABLE IF NOT EXISTS google_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- find_leads and site_check are one Google product (Text Search
  -- Enterprise) and share its free allowance; reviews have their own
  kind TEXT NOT NULL CHECK (kind IN ('find_leads', 'site_check', 'reviews')),
  query TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_calls_kind_created ON google_calls(kind, created_at DESC);

ALTER TABLE google_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can manage google calls" ON google_calls;
CREATE POLICY "Team members can manage google calls"
  ON google_calls FOR ALL
  TO authenticated
  USING (is_team_member())
  WITH CHECK (is_team_member());

INSERT INTO outreach_settings (key, value) VALUES
  ('places_calls_per_minute', '60'::jsonb),
  ('places_daily_call_cap',   '100'::jsonb),
  -- Google's free allowance per product: stop here rather than be charged
  ('places_monthly_call_cap', '1000'::jsonb)
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';

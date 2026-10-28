-- ============================================
-- MIGRATION 006: DISMISSED LEADS
-- Safe to run more than once. Run after 005_audit.sql.
--
-- "Clean up" deletes low-value leads. Without a record of them, the next
-- "Find leads" search would add the same businesses straight back, so
-- their Google listing, website and phone are kept here for dedupe.
-- ============================================

CREATE TABLE IF NOT EXISTS dismissed_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_place_id TEXT,
  website_host TEXT,
  phone_digits TEXT,
  company_name TEXT,
  reason TEXT,
  dismissed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  dismissed_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE dismissed_leads ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dismissed_leads_place_id
  ON dismissed_leads(google_place_id) WHERE google_place_id IS NOT NULL;

-- The team can read and add; removing one (to allow re-sourcing) is done
-- in the SQL editor
DROP POLICY IF EXISTS "Team members can read dismissed leads" ON dismissed_leads;
CREATE POLICY "Team members can read dismissed leads"
  ON dismissed_leads FOR SELECT
  TO authenticated
  USING (is_team_member());

DROP POLICY IF EXISTS "Team members can add dismissed leads" ON dismissed_leads;
CREATE POLICY "Team members can add dismissed leads"
  ON dismissed_leads FOR INSERT
  TO authenticated
  WITH CHECK (is_team_member());

NOTIFY pgrst, 'reload schema';

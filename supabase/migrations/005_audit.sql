-- ============================================
-- MIGRATION 005: SITE AUDIT RESULTS ON LEADS
-- Safe to run more than once. Run after 004_sourcing.sql.
--
-- "Check sites" reads each lead's website (and optionally its Google
-- reviews). The full result is kept on the lead; pain signals for scoring
-- go into leads.signals. See OUTREACH_PLAN.md §5.
-- ============================================

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS audit JSONB,
  ADD COLUMN IF NOT EXISTS audited_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_audited_at ON leads(audited_at);

INSERT INTO outreach_settings (key, value) VALUES
  ('audit_max_age_days', '30'::jsonb),     -- re-check a site after this long
  ('audit_daily_cap',    '800'::jsonb)     -- site checks per day, a PageSpeed/Places cost guard
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';

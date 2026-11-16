-- ============================================
-- MIGRATION 022: CASL BASIS CONFIRMED BY HAND
-- Safe to run more than once. Run after 021_google_calls.sql.
--
-- The CASL rule blocks a Canadian (or no-country) lead unless the email
-- came from their own website, which the paid site check finds. When you
-- already know a lead may be emailed (the business published the address,
-- or agreed to be contacted), tick "CASL basis confirmed" on the lead or
-- on a whole import instead of paying for a site check. This only replaces
-- email_source = 'website' for the CASL rule; every other check still runs.
-- Who ticked it and when is kept as the record. See OUTREACH_PLAN.md §7.
-- ============================================

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS casl_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS casl_confirmed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS casl_note TEXT;

NOTIFY pgrst, 'reload schema';

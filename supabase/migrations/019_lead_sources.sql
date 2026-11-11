-- ============================================
-- MIGRATION 019: LEAD SOURCES BEYOND GOOGLE MAPS
-- Safe to run more than once. Run after 018_property.sql.
--
-- State licence lists (official open data: Texas TREC, New York DOS,
-- Illinois IDFPR; uploaded files for Florida, Georgia and the Carolinas),
-- Florida new business filings, and companies using GoHighLevel or
-- property management software (TheirStack). See OUTREACH_PLAN.md §3.
-- ============================================

-- The record a lead came from ("TX-TREC:9017420-BB"), so a licence or
-- filing is never imported twice, website or not
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_ref TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_source_ref ON leads(source_ref) WHERE source_ref IS NOT NULL;

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
  CHECK (lead_source IN (
    'places', 'lusha', 'import', 'manual', 'referral', 'other', 'theirstack', 'state_license', 'state_filing'
  ));

-- Software a company uses is a signal too ("Uses AppFolio"); those rows
-- have no job title
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'lead_signals'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%kind%'
  LOOP
    EXECUTE format('ALTER TABLE lead_signals DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE lead_signals ADD CONSTRAINT lead_signals_kind_check CHECK (kind IN ('job_post', 'technology'));
ALTER TABLE lead_signals ALTER COLUMN job_title DROP NOT NULL;

INSERT INTO outreach_settings (key, value) VALUES
  ('license_daily_lead_cap', '200'::jsonb),
  -- Counties around the target cities, per state
  ('license_counties', $json${
    "TX": ["Harris", "Fort Bend", "Montgomery", "Dallas", "Collin", "Denton", "Tarrant", "Travis", "Williamson", "Hays", "Bexar"],
    "NY": ["New York", "Kings", "Queens", "Bronx", "Richmond", "Erie", "Monroe", "Albany"],
    "IL": ["Cook", "DuPage", "Will", "Lake", "Kane"],
    "FL": ["Miami-Dade", "Broward", "Hillsborough", "Pinellas", "Orange", "Duval"]
  }$json$::jsonb),
  -- TheirStack technology slugs and the vertical their users get
  ('tech_targets', $json$[
    {"slug": "gohighlevel", "label": "GoHighLevel", "vertical": "agency"},
    {"slug": "appfolio", "label": "AppFolio", "vertical": "property"},
    {"slug": "buildium", "label": "Buildium", "vertical": "property"},
    {"slug": "rent-manager", "label": "Rent Manager", "vertical": "property"},
    {"slug": "propertyware", "label": "Propertyware", "vertical": "property"},
    {"slug": "kvcore", "label": "kvCORE", "vertical": "property"}
  ]$json$::jsonb),
  -- Companies a day from the software search (3 TheirStack credits each)
  ('tech_daily_companies', '50'::jsonb)
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';

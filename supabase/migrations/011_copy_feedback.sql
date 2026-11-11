-- ============================================
-- MIGRATION 011: DRAFT FEEDBACK AND WRITING RULES
-- Safe to run more than once. Run after 010_send.sql.
--
-- Feedback on a Claude draft ("they do have a test-drive form; open with
-- the time lost replying by email") redrafts that email. Ticked "remember",
-- it becomes a writing rule every later draft follows. See OUTREACH_PLAN.md §8.
-- ============================================

-- New angle: request forms (test drive, quote) but nothing books a time
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
    'no_site', 'no_booking', 'request_only', 'not_mobile', 'slow', 'outdated', 'seo_local', 'generic'
  ));

-- active = TRUE: a standing rule in every draft. One-off feedback is kept
-- with active = FALSE as history for the learning loop (§9).
CREATE TABLE IF NOT EXISTS copy_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note TEXT NOT NULL CHECK (char_length(note) BETWEEN 3 AND 500),
  vertical TEXT, -- NULL: every lead
  active BOOLEAN NOT NULL DEFAULT FALSE,
  email_id UUID REFERENCES outreach_emails(id) ON DELETE SET NULL,
  created_by UUID DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE copy_feedback ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_copy_feedback_active
  ON copy_feedback(active, created_at DESC);

DROP POLICY IF EXISTS "Team members can read copy feedback" ON copy_feedback;
CREATE POLICY "Team members can read copy feedback"
  ON copy_feedback FOR SELECT
  TO authenticated
  USING (is_team_member());

DROP POLICY IF EXISTS "Team members can add copy feedback" ON copy_feedback;
CREATE POLICY "Team members can add copy feedback"
  ON copy_feedback FOR INSERT
  TO authenticated
  WITH CHECK (is_team_member());

DROP POLICY IF EXISTS "Team members can update copy feedback" ON copy_feedback;
CREATE POLICY "Team members can update copy feedback"
  ON copy_feedback FOR UPDATE
  TO authenticated
  USING (is_team_member())
  WITH CHECK (is_team_member());

DROP POLICY IF EXISTS "Team members can delete copy feedback" ON copy_feedback;
CREATE POLICY "Team members can delete copy feedback"
  ON copy_feedback FOR DELETE
  TO authenticated
  USING (is_team_member());

NOTIFY pgrst, 'reload schema';

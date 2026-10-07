-- ============================================
-- MIGRATION 001: MEETINGS
-- Safe to run on an existing database (does not drop anything).
-- Run this in Supabase SQL Editor.
-- ============================================

CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  meeting_date TIMESTAMPTZ NOT NULL,
  title TEXT NOT NULL,
  attendee_name TEXT NOT NULL,
  attendee_role TEXT NOT NULL CHECK (attendee_role IN ('employee', 'decision_maker')),
  field_of_work TEXT,
  notes TEXT,
  outcome TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meetings_lead ON meetings(lead_id);
CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(meeting_date DESC);

DROP TRIGGER IF EXISTS update_meetings_updated_at ON meetings;
CREATE TRIGGER update_meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage meetings" ON meetings;
CREATE POLICY "Authenticated users can manage meetings"
  ON meetings FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

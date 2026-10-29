-- ============================================
-- MIGRATION 010: SENDING THROUGH INSTANTLY
-- Safe to run more than once. Run after 009_write_step.sql.
--
-- Approved emails are added to an Instantly campaign one at a time; the
-- lead then moves to Contacted. See OUTREACH_PLAN.md §11.
-- ============================================

-- Why a send failed (Instantly error, missing campaign...)
ALTER TABLE outreach_emails
  ADD COLUMN IF NOT EXISTS last_error TEXT;

CREATE INDEX IF NOT EXISTS idx_outreach_emails_sent_at ON outreach_emails(sent_at);

-- "html": text is escaped and line breaks become <br> (default campaign
-- editor). "text": raw newlines, for a campaign set to plain text only.
INSERT INTO outreach_settings (key, value) VALUES
  ('instantly_body_format', '"html"'::jsonb)
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';

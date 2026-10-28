-- ============================================
-- MIGRATION 009: WRITE STEP (CLAUDE DRAFTS + TEMPLATES)
-- Safe to run more than once. Run after 008_company_size.sql.
--
-- Claude writes each lead's subject and opening line; the rest of the
-- 3-email sequence is a fixed template, so results compare fairly.
-- See OUTREACH_PLAN.md §8.
-- ============================================

ALTER TABLE outreach_emails
  ADD COLUMN IF NOT EXISTS opener TEXT,
  ADD COLUMN IF NOT EXISTS template_key TEXT,
  -- Claude's untouched draft; compared with the approved text to record
  -- author = claude / claude_edited
  ADD COLUMN IF NOT EXISTS draft_steps JSONB,
  ADD COLUMN IF NOT EXISTS drafted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_outreach_emails_drafted_at ON outreach_emails(drafted_at);
CREATE INDEX IF NOT EXISTS idx_outreach_emails_run ON outreach_emails(run_id);

-- Placeholders: {{first_name}} {{company}} {{opener}} {{subject}}
-- {{sender_name}} {{sender_first_name}}. Keyed by vertical, with "default".
-- The footer (mailing address, unsubscribe) is added by Instantly.
INSERT INTO outreach_settings (key, value) VALUES
  ('email_templates', $json${
    "default": [
      {
        "step": 1,
        "subject": "{{subject}}",
        "body": "Hi {{first_name}},\n\n{{opener}}\n\nI'm {{sender_first_name}}. I run OBATEK here in Ottawa. We set up simple tools for trades businesses: online quotes and booking, job tracking, and an AI receptionist that picks up when you're on a job.\n\nWould a free one-page audit of how {{company}} handles calls and quotes be useful?\n\n{{sender_name}}"
      },
      {
        "step": 2,
        "subject": "re: {{subject}}",
        "body": "Hi {{first_name}},\n\nFollowing up in case my last note got buried. If missed calls or slow quotes ever cost {{company}} a job, the free audit would show where. It takes me about 20 minutes and you keep it either way.\n\nWorth sending over?\n\n{{sender_first_name}}"
      },
      {
        "step": 3,
        "subject": "re: {{subject}}",
        "body": "Hi {{first_name}},\n\nI'll leave it here. If it's ever useful, reply \"audit\" and I'll put it together for {{company}}.\n\n{{sender_first_name}}"
      }
    ]
  }$json$::jsonb),
  ('sender_name',      '"Dami Ayoade"'::jsonb),
  ('copy_model',       '"claude-opus-5-5"'::jsonb),
  ('draft_daily_cap',  '300'::jsonb)      -- Claude drafts per day, a cost guard
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';

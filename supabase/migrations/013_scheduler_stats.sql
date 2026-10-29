-- ============================================
-- MIGRATION 013: SCHEDULER AND INSTANTLY STATS
-- Safe to run more than once. Run after 012_car_dealer_template.sql.
--
-- npm run outreach:scheduler calls /api/outreach/cron/tick every 5 minutes:
-- due runs start and get drafts, and opens, replies, bounces and
-- unsubscribes come back from Instantly. See OUTREACH_PLAN.md §11.
-- ============================================

INSERT INTO outreach_settings (key, value) VALUES
  -- Claude drafts per tick for scheduled runs (each takes up to ~30s)
  ('cron_drafts_per_tick',  '5'::jsonb),
  -- Labels replies Instantly hasn't labelled
  ('reply_model',           '"claude-haiku-5-5"'::jsonb),
  -- Set when sending pauses itself (over 5% bounces); shown in the send panel
  ('sending_paused_reason', 'null'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Sent emails waiting for a stats poll
CREATE INDEX IF NOT EXISTS idx_outreach_emails_stats_sync
  ON outreach_emails(stats_synced_at NULLS FIRST)
  WHERE instantly_lead_id IS NOT NULL;

-- Drafts the scheduler still has to write
CREATE INDEX IF NOT EXISTS idx_outreach_emails_undrafted
  ON outreach_emails(run_id, created_at)
  WHERE status = 'draft' AND drafted_at IS NULL;

-- Recent replies in the pop-up
CREATE INDEX IF NOT EXISTS idx_outreach_emails_replied
  ON outreach_emails(replied_at DESC)
  WHERE replied_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';

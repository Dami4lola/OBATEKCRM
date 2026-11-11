-- ============================================
-- MIGRATION 014: SENDING FROM THE MICROSOFT 365 MAILBOX
-- Safe to run more than once. Run after 013_scheduler_stats.sql.
--
-- Replaces Instantly: the engine sends from the getobatek.com mailbox
-- through Microsoft Graph, sends follow-ups itself and reads replies,
-- bounces and "unsubscribe" replies from the inbox. See OUTREACH_PLAN.md §11.
-- ============================================

-- --------------------------------------------
-- The connected mailbox (one row). Holds the Microsoft refresh token,
-- encrypted with MAIL_TOKEN_KEY from .env.local (AES-256-GCM), so a
-- database leak alone can't use it. RLS is on with no policies: only the
-- functions below touch it (§16 S10).
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS outreach_mailbox (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  address TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'needs_reconnect')),
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  connected_by UUID DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE SET NULL,
  -- Inbox sync watermark: mail received after this hasn't been read yet
  inbox_checked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE outreach_mailbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON outreach_mailbox FROM anon, authenticated;

-- Team members (the app) and the service role (the scheduler)
CREATE OR REPLACE FUNCTION outreach_mailbox_allowed()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_team_member() OR coalesce(auth.role(), '') = 'service_role';
$$;

-- What the UI shows: never the token
CREATE OR REPLACE FUNCTION outreach_mailbox_status()
RETURNS TABLE (address TEXT, status TEXT, connected_at TIMESTAMPTZ, inbox_checked_at TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT outreach_mailbox_allowed() THEN
    RAISE EXCEPTION 'No access' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT m.address, m.status, m.connected_at, m.inbox_checked_at FROM outreach_mailbox m;
END;
$$;

-- For the server only: ciphertext, decrypted with MAIL_TOKEN_KEY
CREATE OR REPLACE FUNCTION get_outreach_mailbox_secret()
RETURNS TABLE (address TEXT, refresh_token_enc TEXT, status TEXT, inbox_checked_at TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT outreach_mailbox_allowed() THEN
    RAISE EXCEPTION 'No access' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT m.address, m.refresh_token_enc, m.status, m.inbox_checked_at FROM outreach_mailbox m;
END;
$$;

-- Connecting (or reconnecting) replaces the row. Inbox sync starts from
-- now, or keeps its place when the same mailbox reconnects.
CREATE OR REPLACE FUNCTION connect_outreach_mailbox(p_address TEXT, p_refresh_token_enc TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_team_member() THEN
    RAISE EXCEPTION 'No access' USING ERRCODE = '42501';
  END IF;
  INSERT INTO outreach_mailbox (id, address, refresh_token_enc, status, connected_at, connected_by, inbox_checked_at, updated_at)
  VALUES (TRUE, lower(p_address), p_refresh_token_enc, 'connected', NOW(), auth.uid(), NOW(), NOW())
  ON CONFLICT (id) DO UPDATE SET
    address = EXCLUDED.address,
    refresh_token_enc = EXCLUDED.refresh_token_enc,
    status = 'connected',
    connected_at = NOW(),
    connected_by = auth.uid(),
    inbox_checked_at = CASE
      WHEN outreach_mailbox.address = EXCLUDED.address THEN outreach_mailbox.inbox_checked_at
      ELSE NOW()
    END,
    updated_at = NOW();
END;
$$;

-- Token rotation, status changes and the inbox watermark. NULL = unchanged.
CREATE OR REPLACE FUNCTION update_outreach_mailbox(
  p_refresh_token_enc TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_inbox_checked_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT outreach_mailbox_allowed() THEN
    RAISE EXCEPTION 'No access' USING ERRCODE = '42501';
  END IF;
  UPDATE outreach_mailbox SET
    refresh_token_enc = coalesce(p_refresh_token_enc, refresh_token_enc),
    status = coalesce(p_status, status),
    inbox_checked_at = coalesce(p_inbox_checked_at, inbox_checked_at),
    updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION disconnect_outreach_mailbox()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_team_member() THEN
    RAISE EXCEPTION 'No access' USING ERRCODE = '42501';
  END IF;
  DELETE FROM outreach_mailbox WHERE id;
END;
$$;

REVOKE ALL ON FUNCTION outreach_mailbox_allowed() FROM PUBLIC;
REVOKE ALL ON FUNCTION outreach_mailbox_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION get_outreach_mailbox_secret() FROM PUBLIC;
REVOKE ALL ON FUNCTION connect_outreach_mailbox(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION update_outreach_mailbox(TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION disconnect_outreach_mailbox() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_mailbox_status() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_outreach_mailbox_secret() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION connect_outreach_mailbox(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_outreach_mailbox(TEXT, TEXT, TIMESTAMPTZ) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION disconnect_outreach_mailbox() TO authenticated;

-- --------------------------------------------
-- Every message actually sent: each step of a sequence, plus seed-inbox
-- placement checks and "send test to me". The ids thread follow-ups and
-- match replies.
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS outreach_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID REFERENCES outreach_emails(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'outreach' CHECK (kind IN ('outreach', 'seed', 'test')),
  step INT CHECK (step BETWEEN 1 AND 3),
  to_address TEXT NOT NULL,
  subject TEXT,
  graph_message_id TEXT,
  internet_message_id TEXT,
  conversation_id TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Seed sends only: where it landed, marked by hand
  placement TEXT CHECK (placement IN ('inbox', 'promotions', 'spam', 'missing')),
  placement_checked_at TIMESTAMPTZ,
  UNIQUE (email_id, step)
);

ALTER TABLE outreach_messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_outreach_messages_sent ON outreach_messages(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_messages_conversation
  ON outreach_messages(conversation_id) WHERE conversation_id IS NOT NULL;

DROP POLICY IF EXISTS "Team members can manage outreach messages" ON outreach_messages;
CREATE POLICY "Team members can manage outreach messages"
  ON outreach_messages FOR ALL
  TO authenticated
  USING (is_team_member())
  WITH CHECK (is_team_member());

-- --------------------------------------------
-- outreach_emails: queued (approved, waiting for the scheduler to send)
-- and where each lead is in its 3-step sequence
-- --------------------------------------------
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'outreach_emails'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%''approved''%'
  LOOP
    EXECUTE format('ALTER TABLE outreach_emails DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE outreach_emails ADD CONSTRAINT outreach_emails_status_check
  CHECK (status IN ('blocked', 'draft', 'approved', 'queued', 'sent', 'failed', 'skipped'));

ALTER TABLE outreach_emails
  ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ,
  -- active: follow-ups still to send; finished: all 3 sent; stopped: reply,
  -- bounce, unsubscribe or the lead moved on
  ADD COLUMN IF NOT EXISTS sequence_state TEXT CHECK (sequence_state IN ('active', 'finished', 'stopped')),
  ADD COLUMN IF NOT EXISTS next_step INT CHECK (next_step BETWEEN 2 AND 3),
  ADD COLUMN IF NOT EXISTS next_step_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stopped_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_outreach_emails_queued
  ON outreach_emails(queued_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_outreach_emails_next_step
  ON outreach_emails(next_step_at) WHERE sequence_state = 'active';

-- --------------------------------------------
-- Settings
-- --------------------------------------------
INSERT INTO outreach_settings (key, value) VALUES
  -- Only a mailbox on this domain can be connected
  ('sending_domain',          '"getobatek.com"'::jsonb),
  -- send_window (002) is read in this timezone
  ('send_timezone',           '"America/Toronto"'::jsonb),
  -- Messages per 5-minute scheduler tick, so a day's sends are spread out
  ('sends_per_tick',          '2'::jsonb),
  -- Business days before step 2, then before step 3
  ('followup_business_days',  '[3, 5]'::jsonb),
  -- Warm-up: messages a day in week 1, 2, 3, 4+ after warmup_started_at.
  -- daily_send_cap still applies on top.
  ('send_ramp',               '[5, 10, 15, 20]'::jsonb),
  ('warmup_started_at',       'null'::jsonb),
  -- Your own Gmail/Outlook inboxes for placement checks
  ('seed_addresses',          '[]'::jsonb),
  -- Auto mode unlocks on reply rate now that opens aren't tracked (§9)
  ('auto_unlock_reply_rate',  '0.05'::jsonb)
ON CONFLICT (key) DO NOTHING;

DELETE FROM outreach_settings WHERE key IN ('instantly_campaigns', 'instantly_body_format');

NOTIFY pgrst, 'reload schema';

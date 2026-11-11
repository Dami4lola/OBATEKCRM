-- ============================================
-- MIGRATION 020: SAVE MAILBOX UPDATES
-- Safe to run more than once. Run after 019_lead_sources.sql.
--
-- update_outreach_mailbox (014) had no WHERE, and Supabase refuses an
-- UPDATE without one through its API ("UPDATE requires a WHERE clause").
-- So every mailbox login failed once Microsoft issued a new refresh token,
-- and the inbox sync couldn't save its place. See OUTREACH_PLAN.md §11.
-- ============================================

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
    updated_at = NOW()
  WHERE id;
END;
$$;

-- ============================================
-- MIGRATION 007: DAILY SITE CHECK LIMIT + CLEAN UP RULE
-- Safe to run more than once. Run after 006_dismissed_leads.sql.
-- ============================================

-- 800 site checks a day (was 150). One full day still fits in Google's
-- 1,000 free searches a month for the website lookup; several such days
-- in a month would go past it (about $35 per 1,000 after that).
INSERT INTO outreach_settings (key, value) VALUES ('audit_daily_cap', '800'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Clean up also offers leads whose only email is a shared inbox (info@,
-- office@...) unless they score at least this much
INSERT INTO outreach_settings (key, value) VALUES ('generic_email_keep_score', '7'::jsonb)
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- ============================================
-- MIGRATION 008: SMALL BUSINESS SIZE FOR CLEAN UP
-- Safe to run more than once. Run after 007_cleanup_rules.sql.
--
-- Clean up's generic-email rule (only info@, office@... on file) now
-- spares small companies, where a shared inbox still reaches the owner.
-- Size comes from staff_size, the website's own wording, or Google review
-- count; unknown counts as small. See src/lib/outreach/company-size.ts.
-- ============================================

INSERT INTO outreach_settings (key, value) VALUES ('small_business_max_staff', '50'::jsonb)
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';

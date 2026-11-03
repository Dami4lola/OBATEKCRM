-- ============================================
-- MIGRATION 015: MARKETING AGENCIES AS A SECOND TARGET
-- Safe to run more than once. Run after 014_mailbox.sql.
--
-- Web design, local SEO, GoHighLevel and Google Ads agencies (2-20 staff,
-- Eastern and Central US) alongside trades and car dealers. The offer is
-- the agency's own back office: inquiry follow-up, an AI receptionist for
-- the sales line, discovery calls booked onto the calendar. See
-- OUTREACH_PLAN.md §3, §4 and §8.
-- ============================================

-- Added only if missing, so edits made in the settings table are kept.
-- US spelling: these leads are in the US.
UPDATE outreach_settings
SET value = value || jsonb_build_object('agency', $json$[
  {
    "step": 1,
    "subject": "{{subject}}",
    "body": "Hi {{first_name}},\n\n{{opener}}\n\nI'm {{sender_first_name}}. I run OBATEK, a small automation shop. We set up the back office for agencies like {{company}}: instant follow-up on every new inquiry, an AI receptionist for your sales line during client calls, and discovery calls booked straight onto your calendar.\n\nWould a free one-page audit of how {{company}} handles new inquiries be useful?\n\n{{sender_name}}"
  },
  {
    "step": 2,
    "subject": "re: {{subject}}",
    "body": "Hi {{first_name}},\n\nFollowing up in case my last note got buried. If a good lead ever went cold while the team was heads-down on client work, the free audit would show where {{company}}'s inquiries slip. It takes me about 20 minutes and you keep it either way.\n\nWorth sending over?\n\n{{sender_first_name}}"
  },
  {
    "step": 3,
    "subject": "re: {{subject}}",
    "body": "Hi {{first_name}},\n\nI'll leave it here. If it's ever useful, reply \"audit\" and I'll put it together for {{company}}.\n\n{{sender_first_name}}"
  }
]$json$::jsonb)
WHERE key = 'email_templates' AND NOT (value ? 'agency');

-- Agencies earn the target-vertical point too
UPDATE outreach_settings
SET value = value || '["agency"]'::jsonb
WHERE key = 'target_verticals' AND NOT (value ? 'agency');

-- Staff counts that earn the size points, by vertical
INSERT INTO outreach_settings (key, value) VALUES
  ('staff_range', '{"default": [2, 15], "agency": [2, 20]}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Agencies imported from Lusha ("Marketing & Advertising") or typed in
UPDATE leads
SET vertical = 'agency'
WHERE vertical IS NOT NULL
  AND vertical <> 'agency'
  AND (
    vertical ILIKE '%marketing%'
    OR vertical ILIKE '%advertising%'
    OR vertical ILIKE '%web design%'
    OR vertical ILIKE '%seo%'
    OR vertical ILIKE '%agency%'
  );

NOTIFY pgrst, 'reload schema';

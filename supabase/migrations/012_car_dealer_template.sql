-- ============================================
-- MIGRATION 012: CAR DEALER EMAIL TEMPLATE
-- Safe to run more than once. Run after 011_copy_feedback.sql.
--
-- Car dealers get their own email template: the default one says "tools
-- for trades businesses". Leads with vertical car_dealer use it; Find leads
-- has a "car dealer" vertical. See OUTREACH_PLAN.md §8.
-- ============================================

-- Added only if missing, so edits made in the settings table are kept
UPDATE outreach_settings
SET value = value || jsonb_build_object('car_dealer', $json$[
  {
    "step": 1,
    "subject": "{{subject}}",
    "body": "Hi {{first_name}},\n\n{{opener}}\n\nI'm {{sender_first_name}}. I run OBATEK here in Ottawa. We help dealerships let buyers book test drives online, follow up on every enquiry, and answer calls with an AI receptionist when the team is busy or the lot is closed.\n\nWould a free one-page audit of how {{company}} handles calls and buyer enquiries be useful?\n\n{{sender_name}}"
  },
  {
    "step": 2,
    "subject": "re: {{subject}}",
    "body": "Hi {{first_name}},\n\nFollowing up in case my last note got buried. If a missed call or a slow reply to a test-drive request ever cost {{company}} a sale, the free audit would show where. It takes me about 20 minutes and you keep it either way.\n\nWorth sending over?\n\n{{sender_first_name}}"
  },
  {
    "step": 3,
    "subject": "re: {{subject}}",
    "body": "Hi {{first_name}},\n\nI'll leave it here. If it's ever useful, reply \"audit\" and I'll put it together for {{company}}.\n\n{{sender_first_name}}"
  }
]$json$::jsonb)
WHERE key = 'email_templates' AND NOT (value ? 'car_dealer');

-- Existing dealers typed in by hand or imported ("Used car dealer",
-- "Auto dealership") move to the car_dealer vertical
UPDATE leads
SET vertical = 'car_dealer'
WHERE vertical IS NOT NULL
  AND vertical <> 'car_dealer'
  AND (
    vertical ILIKE '%car%deal%'
    OR vertical ILIKE '%auto%deal%'
    OR vertical ILIKE '%dealership%'
    OR vertical ILIKE '%used%car%'
  );

NOTIFY pgrst, 'reload schema';

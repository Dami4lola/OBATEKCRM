-- ============================================
-- MIGRATION 023: HOME CARE AGENCIES AS A TARGET
-- Safe to run more than once. Run after 022_casl_confirmed.sql.
--
-- Non-medical senior home care agencies (personal care, companionship,
-- caregivers sent to clients' homes), in Canada and the US. Families
-- call about care for a parent in the evenings and at weekends, hospital
-- and doctor referrals need a quick reply, and inquiries live in inboxes
-- and spreadsheets. The offer: a simple CRM for every family inquiry and
-- referral, instant replies, and an AI receptionist for after-hours calls
-- from families and caregivers. See OUTREACH_PLAN.md §3, §4 and §8.
-- ============================================

-- Added only if missing, so edits made in the settings table are kept.
-- "Inquiry" reads fine in both Canada and the US.
UPDATE outreach_settings
SET value = value || jsonb_build_object('home_care', $json$[
  {
    "step": 1,
    "subject": "{{subject}}",
    "body": "Hi {{first_name}},\n\n{{opener}}\n\nI'm {{sender_first_name}}. I run OBATEK, a small automation shop. For home care agencies like {{company}}, we set up a simple CRM that keeps every family inquiry and referral in one place, instant replies so families hear back right away, and an AI receptionist for after-hours calls from families and caregivers.\n\nWould a free one-page audit of how {{company}} handles calls and inquiries be useful?\n\n{{sender_name}}"
  },
  {
    "step": 2,
    "subject": "re: {{subject}}",
    "body": "Hi {{first_name}},\n\nFollowing up in case my last note got buried. If a family ever called about care for a parent in the evening and nobody picked up, the free audit would show where {{company}} loses those calls. It takes me about 20 minutes and you keep it either way.\n\nWorth sending over?\n\n{{sender_first_name}}"
  },
  {
    "step": 3,
    "subject": "re: {{subject}}",
    "body": "Hi {{first_name}},\n\nI'll leave it here. If it's ever useful, reply \"audit\" and I'll put it together for {{company}}.\n\n{{sender_first_name}}"
  }
]$json$::jsonb)
WHERE key = 'email_templates' AND NOT (value ? 'home_care');

-- Home care earns the target-vertical point
UPDATE outreach_settings
SET value = value || '["home_care"]'::jsonb
WHERE key = 'target_verticals' AND NOT (value ? 'home_care');

-- Agencies count their caregivers as staff, so 2-15 would mark most of
-- them down; 50 matches small_business_max_staff
UPDATE outreach_settings
SET value = value || '{"home_care": [2, 50]}'::jsonb
WHERE key = 'staff_range' AND NOT (value ? 'home_care');

-- Leads imported (e.g. Lusha "Home Health Care Services") or typed in.
-- Known verticals are left alone.
UPDATE leads
SET vertical = 'home_care'
WHERE vertical IS NOT NULL
  AND vertical NOT IN (
    'hvac', 'plumbing', 'electrical', 'roofing', 'cleaning', 'handyman',
    'landscaping', 'fleet_trucking', 'car_dealer', 'agency', 'property', 'home_care'
  )
  AND (
    vertical ILIKE '%home care%'
    OR vertical ILIKE '%homecare%'
    OR vertical ILIKE '%home-care%'
    OR vertical ILIKE '%home health%'
    OR vertical ILIKE '%senior care%'
    OR vertical ILIKE '%elder care%'
    OR vertical ILIKE '%eldercare%'
    OR vertical ILIKE '%elderly care%'
    OR vertical ILIKE '%caregiver%'
    OR vertical ILIKE '%personal support%'
    OR vertical ILIKE '%companion care%'
  );

NOTIFY pgrst, 'reload schema';

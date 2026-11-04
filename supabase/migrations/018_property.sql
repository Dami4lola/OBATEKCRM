-- ============================================
-- MIGRATION 018: PROPERTY MANAGERS AND BROKERAGES AS A TARGET
-- Safe to run more than once. Run after 017_buying_signals.sql.
--
-- Small property management companies and real estate brokerages (2-20
-- staff) in the same US states as agencies. Calls, rental and listing
-- inquiries and maintenance requests wait while the team is out at
-- showings, and leads live in inboxes and spreadsheets. The offer: a
-- simple CRM, instant replies, an AI receptionist for after-hours calls.
-- See OUTREACH_PLAN.md §3, §4 and §8.
-- ============================================

-- Added only if missing, so edits made in the settings table are kept.
-- US spelling: these leads are in the US.
UPDATE outreach_settings
SET value = value || jsonb_build_object('property', $json$[
  {
    "step": 1,
    "subject": "{{subject}}",
    "body": "Hi {{first_name}},\n\n{{opener}}\n\nI'm {{sender_first_name}}. I run OBATEK, a small automation shop. For property managers and brokerages like {{company}}, we set up a CRM that keeps every lead, tenant and owner in one place, instant replies to inquiries, and an AI receptionist for after-hours calls.\n\nWould a free one-page audit of how {{company}} handles calls and inquiries be useful?\n\n{{sender_name}}"
  },
  {
    "step": 2,
    "subject": "re: {{subject}}",
    "body": "Hi {{first_name}},\n\nFollowing up in case my last note got buried. If an inquiry or a maintenance call ever slipped through while the team was out at a showing, the free audit would show where {{company}} loses them. It takes me about 20 minutes and you keep it either way.\n\nWorth sending over?\n\n{{sender_first_name}}"
  },
  {
    "step": 3,
    "subject": "re: {{subject}}",
    "body": "Hi {{first_name}},\n\nI'll leave it here. If it's ever useful, reply \"audit\" and I'll put it together for {{company}}.\n\n{{sender_first_name}}"
  }
]$json$::jsonb)
WHERE key = 'email_templates' AND NOT (value ? 'property');

-- Property earns the target-vertical point; so do car dealers, which 012
-- gave a template but never added here
UPDATE outreach_settings
SET value = value || '["car_dealer"]'::jsonb
WHERE key = 'target_verticals' AND NOT (value ? 'car_dealer');

UPDATE outreach_settings
SET value = value || '["property"]'::jsonb
WHERE key = 'target_verticals' AND NOT (value ? 'property');

-- Same staff range as agencies
UPDATE outreach_settings
SET value = value || '{"property": [2, 20]}'::jsonb
WHERE key = 'staff_range' AND NOT (value ? 'property');

-- Buying signals: real estate's appointment setter (inside sales agent)
-- and property managers' front desk
UPDATE outreach_settings SET value = value || '["inside sales agent"]'::jsonb
WHERE key = 'signal_roles' AND NOT (value ? 'inside sales agent');
UPDATE outreach_settings SET value = value || '["leasing agent"]'::jsonb
WHERE key = 'signal_roles' AND NOT (value ? 'leasing agent');
UPDATE outreach_settings SET value = value || '["property administrator"]'::jsonb
WHERE key = 'signal_roles' AND NOT (value ? 'property administrator');

-- The fit check can now say a post is from a property manager or brokerage
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'lead_signals'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%fit_target%'
  LOOP
    EXECUTE format('ALTER TABLE lead_signals DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE lead_signals ADD CONSTRAINT lead_signals_fit_target_check
  CHECK (fit_target IN ('agency', 'trades', 'dealer', 'property', 'other'));

-- Leads imported from Lusha ("Real Estate") or typed in. Known verticals
-- are left alone ("property maintenance" is handyman).
UPDATE leads
SET vertical = 'property'
WHERE vertical IS NOT NULL
  AND vertical NOT IN (
    'hvac', 'plumbing', 'electrical', 'roofing', 'cleaning', 'handyman',
    'landscaping', 'fleet_trucking', 'car_dealer', 'agency', 'property'
  )
  AND (
    vertical ILIKE '%property manag%'
    OR vertical ILIKE '%real estate%'
    OR vertical ILIKE '%realty%'
    OR vertical ILIKE '%realtor%'
    OR vertical ILIKE '%brokerage%'
    OR vertical ILIKE '%leasing%'
    OR vertical ILIKE '%rental management%'
  );

NOTIFY pgrst, 'reload schema';

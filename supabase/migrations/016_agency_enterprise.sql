-- ============================================
-- MIGRATION 016: "FORTUNE 500" NO LONGER SINKS A TARGET AGENCY
-- Safe to run more than once. Run after 015_agencies.sql.
--
-- The site check used to mark any agency off-target for enterprise wording
-- ("Fortune 500", "global brands", "enterprise clients"). Small shops boast
-- like that too, so it now only counts when the site shows none of the
-- target services (web design, local SEO, Google Ads) and no GoHighLevel.
-- This clears the flag on agencies already checked, and turns the old
-- evidence line into the note the site check now writes.
-- ============================================

UPDATE leads
SET
  signals = signals - 'off_target',
  audit = jsonb_set(
    jsonb_set(audit, '{agency,off_target}', 'null'::jsonb),
    '{agency,evidence}',
    COALESCE((
      SELECT jsonb_agg(
        CASE
          WHEN line LIKE 'Enterprise wording: %'
            THEN to_jsonb('Big-client wording (' || substr(line, 21) || '): check the team size')
          ELSE to_jsonb(line)
        END
        ORDER BY n
      )
      FROM jsonb_array_elements_text(audit->'agency'->'evidence') WITH ORDINALITY AS t(line, n)
    ), '[]'::jsonb)
  )
WHERE audit->'agency'->>'off_target' = 'enterprise'
  AND (
    jsonb_array_length(COALESCE(audit->'agency'->'services', '[]'::jsonb)) > 0
    OR audit->'agency'->>'gohighlevel' = 'true'
  );

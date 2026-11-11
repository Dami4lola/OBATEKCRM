-- ============================================
-- MIGRATION 003: TEAM-ONLY ACCESS
-- Safe to run more than once. Run after 002_outreach.sql.
--
-- Before this, every policy allowed any logged-in user, and anyone can
-- sign up, so a stranger with an account could read every lead.
-- Now only users listed in team_members can see or change CRM data.
-- A new sign-up gets a profile but sees nothing until added here.
--
-- Everyone with an account when this first runs is added to the team.
-- Check the list afterwards and remove anyone you don't know:
--   SELECT p.email, t.role FROM team_members t JOIN profiles p ON p.id = t.user_id;
--   DELETE FROM team_members WHERE user_id = (SELECT id FROM profiles WHERE email = '...');
-- Add a teammate later (after they sign up):
--   INSERT INTO team_members (user_id) SELECT id FROM profiles WHERE email = '...';
-- ============================================

-- ============================================
-- STEP 1: TEAM MEMBERS
-- Managed from the SQL editor only; the app can read but not change it
-- ============================================

CREATE TABLE IF NOT EXISTS team_members (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Locked from the start: no policy yet means no client access at all
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Seed once: the oldest account is the owner, the rest are members
INSERT INTO team_members (user_id, role)
SELECT id,
       CASE WHEN ROW_NUMBER() OVER (ORDER BY created_at, id) = 1 THEN 'owner' ELSE 'member' END
FROM profiles
WHERE NOT EXISTS (SELECT 1 FROM team_members)
ON CONFLICT (user_id) DO NOTHING;

-- SECURITY DEFINER so policies can check membership without the caller
-- needing access to team_members (and without recursive policy checks)
CREATE OR REPLACE FUNCTION is_team_member()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION is_team_member() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_team_member() TO authenticated;

-- ============================================
-- STEP 2: REPLACE EVERY POLICY ON CRM TABLES
-- Drops whatever policies exist (names differ between setups) and
-- recreates them with the team check
-- ============================================

DO $$
DECLARE
  t TEXT;
  p RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'team_members', 'profiles', 'pipelines', 'stages', 'leads', 'activities',
    'tasks', 'meetings', 'outreach_runs', 'outreach_emails',
    'suppression_list', 'outreach_settings'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
        EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
      END LOOP;
    END IF;
  END LOOP;

  -- Full access for the team
  FOREACH t IN ARRAY ARRAY[
    'pipelines', 'stages', 'leads', 'activities', 'tasks', 'meetings',
    'outreach_runs', 'outreach_emails'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format(
        'CREATE POLICY "Team members can manage %s" ON public.%I FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member())',
        t, t
      );
    END IF;
  END LOOP;
END $$;

CREATE POLICY "Team members can read team"
  ON team_members FOR SELECT
  TO authenticated
  USING (is_team_member());

-- Profiles: the team can see each other; anyone can see their own row
CREATE POLICY "Team members can read profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (is_team_member() OR auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Suppressions can be added but never removed from the app
CREATE POLICY "Team members can read suppression list"
  ON suppression_list FOR SELECT
  TO authenticated
  USING (is_team_member());

CREATE POLICY "Team members can add suppressions"
  ON suppression_list FOR INSERT
  TO authenticated
  WITH CHECK (is_team_member());

-- Settings can be changed but not added or deleted from the app
CREATE POLICY "Team members can read outreach settings"
  ON outreach_settings FOR SELECT
  TO authenticated
  USING (is_team_member());

CREATE POLICY "Team members can update outreach settings"
  ON outreach_settings FOR UPDATE
  TO authenticated
  USING (is_team_member())
  WITH CHECK (is_team_member());

NOTIFY pgrst, 'reload schema';

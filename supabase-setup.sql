-- ============================================
-- OBATEK CRM - COMPLETE DATABASE SETUP
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- STEP 1: DROP EXISTING TABLES & FUNCTIONS
-- (in reverse dependency order)
-- ============================================

-- Drop triggers first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS update_leads_updated_at ON leads;

-- Drop functions
DROP FUNCTION IF EXISTS handle_new_user();
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP FUNCTION IF EXISTS move_lead(UUID, UUID, INT);

-- Drop tables (order matters due to foreign keys)
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS activities CASCADE;
DROP TABLE IF EXISTS leads CASCADE;
DROP TABLE IF EXISTS stages CASCADE;
DROP TABLE IF EXISTS pipelines CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- ============================================
-- STEP 2: CREATE TABLES
-- ============================================

-- Profiles table (auto-created on signup)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pipelines table (multiple pipelines support)
CREATE TABLE pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stages table (columns with ordering)
CREATE TABLE stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leads table (cards with stage and position)
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  company_name TEXT,
  contact_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  value DECIMAL(12,2),
  notes TEXT,
  position_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activities table
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'note', 'call', 'email', 'meeting'
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks table
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'completed'
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- STEP 3: CREATE INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX idx_leads_stage_position ON leads(stage_id, position_index);
CREATE INDEX idx_stages_pipeline_order ON stages(pipeline_id, order_index);
CREATE INDEX idx_activities_lead ON activities(lead_id);
CREATE INDEX idx_tasks_lead ON tasks(lead_id);

-- ============================================
-- STEP 4: CREATE FUNCTIONS & TRIGGERS
-- ============================================

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_leads_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- STEP 5: MOVE_LEAD RPC FUNCTION
-- Handles drag-and-drop reordering atomically
-- ============================================

CREATE OR REPLACE FUNCTION move_lead(
  p_lead_id UUID,
  p_new_stage_id UUID,
  p_new_position INT
) RETURNS VOID AS $$
DECLARE
  v_old_stage_id UUID;
  v_old_position INT;
BEGIN
  -- Get current details
  SELECT stage_id, position_index INTO v_old_stage_id, v_old_position
  FROM leads WHERE id = p_lead_id;

  -- 1. If moving within the SAME stage
  IF v_old_stage_id = p_new_stage_id THEN
    IF p_new_position > v_old_position THEN
      -- Moving down: Shift items between old and new UP
      UPDATE leads
      SET position_index = position_index - 1
      WHERE stage_id = p_new_stage_id
        AND position_index > v_old_position
        AND position_index <= p_new_position;
    ELSE
      -- Moving up: Shift items between new and old DOWN
      UPDATE leads
      SET position_index = position_index + 1
      WHERE stage_id = p_new_stage_id
        AND position_index >= p_new_position
        AND position_index < v_old_position;
    END IF;

  -- 2. If moving to a DIFFERENT stage
  ELSE
    -- A. Close the gap in the OLD stage (shift lower items up)
    UPDATE leads
    SET position_index = position_index - 1
    WHERE stage_id = v_old_stage_id
      AND position_index > v_old_position;

    -- B. Open a space in the NEW stage (shift items down)
    UPDATE leads
    SET position_index = position_index + 1
    WHERE stage_id = p_new_stage_id
      AND position_index >= p_new_position;
  END IF;

  -- 3. Finally, move the target lead
  UPDATE leads
  SET stage_id = p_new_stage_id,
      position_index = p_new_position,
      updated_at = NOW()
  WHERE id = p_lead_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STEP 6: ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 7: CREATE RLS POLICIES
-- (Shared workspace - all authenticated users can access everything)
-- ============================================

-- Profiles: read only
CREATE POLICY "Authenticated users can read profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- Pipelines: read only
CREATE POLICY "Authenticated users can read pipelines"
  ON pipelines FOR SELECT
  TO authenticated
  USING (true);

-- Stages: read only
CREATE POLICY "Authenticated users can read stages"
  ON stages FOR SELECT
  TO authenticated
  USING (true);

-- Leads: full access
CREATE POLICY "Authenticated users full access to leads"
  ON leads FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Activities: full access
CREATE POLICY "Authenticated users full access to activities"
  ON activities FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Tasks: full access
CREATE POLICY "Authenticated users full access to tasks"
  ON tasks FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================
-- STEP 8: INSERT DEFAULT DATA
-- ============================================

-- Default pipeline
INSERT INTO pipelines (id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Sales Pipeline');

-- Default stages
INSERT INTO stages (pipeline_id, name, color, order_index) VALUES
  ('00000000-0000-0000-0000-000000000001', 'New', '#6366f1', 0),
  ('00000000-0000-0000-0000-000000000001', 'Contacted', '#f59e0b', 1),
  ('00000000-0000-0000-0000-000000000001', 'Qualified', '#3b82f6', 2),
  ('00000000-0000-0000-0000-000000000001', 'Proposal', '#8b5cf6', 3),
  ('00000000-0000-0000-0000-000000000001', 'Won', '#22c55e', 4),
  ('00000000-0000-0000-0000-000000000001', 'Lost', '#ef4444', 5);

-- ============================================
-- DONE! Your database is ready.
-- ============================================

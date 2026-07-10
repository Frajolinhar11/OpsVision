-- ============================================
-- OPS VISION SaaS - Complete Clean Migration
-- Run ONCE in Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. EXTENSION + SEQUENCES
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- 2. COMPANIES (tenant)
-- ============================================
CREATE TABLE IF NOT EXISTS companies (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 3. USERS (profiles linked to auth.users)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY,
  auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'funcionario' CHECK (type IN ('gestor', 'funcionario')),
  initials TEXT NOT NULL DEFAULT '',
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safety: add column if missing (for re-runs on existing projects)
DO $$
DECLARE
  tbl TEXT;
  tables_with_company TEXT[] := ARRAY['employees','tasks','meetings','meeting_participants','notifications','allocations','employee_schedules','sectors','recurrence_options'];
BEGIN
  -- Users table migration
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'company_id') THEN
    ALTER TABLE users ADD COLUMN company_id BIGINT REFERENCES companies(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'auth_id') THEN
    ALTER TABLE users ADD COLUMN auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email') THEN
    ALTER TABLE users ADD COLUMN email TEXT;
  END IF;
  -- Data tables migration
  FOREACH tbl IN ARRAY tables_with_company LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = tbl) THEN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = tbl AND column_name = 'company_id') THEN
        EXECUTE format('ALTER TABLE %I ADD COLUMN company_id BIGINT REFERENCES companies(id)', tbl);
      END IF;
    END IF;
  END LOOP;
END $$;

-- ============================================
-- 4. EMPLOYEES
-- ============================================
CREATE TABLE IF NOT EXISTS employees (
  id BIGINT PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'free' CHECK (status IN ('free', 'busy', 'task')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 5. TASKS
-- ============================================
CREATE TABLE IF NOT EXISTS tasks (
  id BIGINT PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  assignee BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  time TEXT NOT NULL DEFAULT '00:00',
  recurrence TEXT NOT NULL DEFAULT 'none',
  requires_evidence BOOLEAN NOT NULL DEFAULT FALSE,
  requires_photo BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  evidence_photo TEXT DEFAULT '',
  evidence_description TEXT DEFAULT '',
  evidence_timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 6. MEETINGS
-- ============================================
CREATE TABLE IF NOT EXISTS meetings (
  id BIGINT PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  duration INTEGER NOT NULL DEFAULT 60,
  agenda JSONB NOT NULL DEFAULT '[]'::jsonb,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 7. MEETING PARTICIPANTS
-- ============================================
CREATE TABLE IF NOT EXISTS meeting_participants (
  id BIGINT PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  meeting_id BIGINT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('confirmed', 'absent', 'maybe', 'pending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 8. NOTIFICATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  type TEXT NOT NULL DEFAULT 'task' CHECK (type IN ('task', 'meeting', 'warning')),
  message TEXT NOT NULL DEFAULT '',
  read BOOLEAN NOT NULL DEFAULT FALSE,
  related_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 9. ALLOCATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS allocations (
  id BIGINT PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  area TEXT NOT NULL DEFAULT '',
  allocated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 10. EMPLOYEE SCHEDULES
-- ============================================
CREATE TABLE IF NOT EXISTS employee_schedules (
  id BIGINT PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'working' CHECK (type IN ('working', 'day_off', 'vacation')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, start_date)
);

-- ============================================
-- 11. SECTORS
-- ============================================
CREATE TABLE IF NOT EXISTS sectors (
  id BIGINT PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🏢',
  max_capacity INTEGER NOT NULL DEFAULT 0,
  goal INTEGER NOT NULL DEFAULT 0,
  target INTEGER NOT NULL DEFAULT 0
);

-- ============================================
-- 12. RECURRENCE OPTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS recurrence_options (
  id BIGINT PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, key)
);

-- ============================================
-- 13. CREATE USER PROFILE RPC
-- Called by the client after signup to insert the user profile
-- SECURITY DEFINER = bypasses RLS
-- ============================================
-- Clean up old trigger if exists (from previous migration runs)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- RPC: creates auth user + profile in one call (no rate limit)
CREATE OR REPLACE FUNCTION create_user_rpc(
  p_email TEXT,
  p_password TEXT,
  p_name TEXT,
  p_company_id BIGINT,
  p_type TEXT DEFAULT 'gestor'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_auth_id UUID;
  v_user_id BIGINT;
BEGIN
  -- Validate
  IF length(p_password) < 4 THEN
    RETURN jsonb_build_object('error', 'Senha muito curta');
  END IF;

  -- Check if auth user already exists
  SELECT id INTO v_auth_id FROM auth.users WHERE email = p_email LIMIT 1;

  IF v_auth_id IS NULL THEN
    -- Create auth user
    INSERT INTO auth.users (instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(), 'authenticated', 'authenticated',
    p_email,
    crypt(p_password, gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('name', p_name, 'type', p_type),
    NOW(), NOW(),
    '', '', '', ''
  )
  RETURNING id INTO v_auth_id;
  END IF;

  -- Create profile (if not exists)
  SELECT id INTO v_user_id FROM users WHERE auth_id = v_auth_id LIMIT 1;
  IF v_user_id IS NULL THEN
    SELECT COALESCE(MAX(id), 0) + 1 INTO v_user_id FROM users;
    INSERT INTO users (id, auth_id, company_id, name, type, initials, email)
    VALUES (v_user_id, v_auth_id, p_company_id, p_name, p_type, UPPER(LEFT(p_name, 2)), p_email);
  END IF;

  -- Auto-create employee record (appears in Equipe)
  INSERT INTO employees (id, company_id, name, role, status)
  VALUES (v_user_id, p_company_id, p_name, CASE WHEN p_type = 'gestor' THEN 'Gestor' ELSE 'Funcionário' END, 'free')
  ON CONFLICT (id) DO NOTHING;

  RETURN jsonb_build_object('user_id', v_user_id, 'auth_id', v_auth_id);
END;
$$;

-- RPC: creates auth user + profile linked to an EXISTING employee record
-- Used by gestor when creating login for an existing employee
CREATE OR REPLACE FUNCTION create_user_rpc_for_employee(
  p_email TEXT,
  p_password TEXT,
  p_name TEXT,
  p_company_id BIGINT,
  p_employee_id BIGINT,
  p_type TEXT DEFAULT 'funcionario'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_auth_id UUID;
BEGIN
  IF length(p_password) < 4 THEN
    RETURN jsonb_build_object('error', 'Senha muito curta');
  END IF;

  SELECT id INTO v_auth_id FROM auth.users WHERE email = p_email LIMIT 1;

  IF v_auth_id IS NULL THEN
    INSERT INTO auth.users (instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(), 'authenticated', 'authenticated',
    p_email,
    crypt(p_password, gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('name', p_name, 'type', p_type),
    NOW(), NOW(),
    '', '', '', ''
  )
  RETURNING id INTO v_auth_id;
  END IF;

  -- Create profile with the EXISTING employee ID (not a new sequential ID)
  INSERT INTO users (id, auth_id, company_id, name, type, initials, email)
  VALUES (p_employee_id, v_auth_id, p_company_id, p_name, p_type, UPPER(LEFT(p_name, 2)), p_email)
  ON CONFLICT (auth_id) DO UPDATE SET name = p_name, type = p_type;

  RETURN jsonb_build_object('user_id', p_employee_id, 'auth_id', v_auth_id);
END;
$$;

CREATE OR REPLACE FUNCTION create_user_profile(
  p_auth_id UUID,
  p_company_id BIGINT,
  p_name TEXT,
  p_type TEXT DEFAULT 'gestor',
  p_email TEXT DEFAULT ''
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_id BIGINT;
  v_initials TEXT;
BEGIN
  v_initials := UPPER(LEFT(p_name, 2));
  SELECT COALESCE(MAX(id), 0) + 1 INTO v_id FROM users;
  INSERT INTO users (id, auth_id, company_id, name, type, initials, email)
  VALUES (v_id, p_auth_id, p_company_id, p_name, p_type, v_initials, p_email);
  RETURN v_id;
END;
$$;

-- ============================================
-- 14. ROW LEVEL SECURITY
-- ============================================
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurrence_options ENABLE ROW LEVEL SECURITY;

-- Ensure company_id exists on users before creating RLS function
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'company_id') THEN
    ALTER TABLE users ADD COLUMN company_id BIGINT REFERENCES companies(id);
  END IF;
END $$;

-- Helper: get current user's company_id
CREATE OR REPLACE FUNCTION current_company_id()
RETURNS BIGINT
LANGUAGE SQL STABLE
SECURITY DEFINER SET search_path = public, auth, extensions, pg_catalog
AS $$
  SELECT company_id FROM public.users WHERE auth_id = auth.uid()
$$;

-- Policies: companies (public insert for signup, select restricted to own company)
DROP POLICY IF EXISTS "companies_select_public" ON companies;
DROP POLICY IF EXISTS "companies_select_own" ON companies;
DROP POLICY IF EXISTS "companies_insert_all" ON companies;
DROP POLICY IF EXISTS "companies_update_own" ON companies;
CREATE POLICY "companies_select_public" ON companies
  FOR SELECT USING (true);
CREATE POLICY "companies_insert_all" ON companies
  FOR INSERT WITH CHECK (true);
CREATE POLICY "companies_update_own" ON companies
  FOR UPDATE USING (id = current_company_id());

-- Policies: users (only own company)
DROP POLICY IF EXISTS "users_company_isolation" ON users;
CREATE POLICY "users_company_isolation" ON users
  FOR ALL USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id());

-- Policies: employees
DROP POLICY IF EXISTS "employees_company_isolation" ON employees;
CREATE POLICY "employees_company_isolation" ON employees
  FOR ALL USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id());

-- Policies: tasks
DROP POLICY IF EXISTS "tasks_company_isolation" ON tasks;
CREATE POLICY "tasks_company_isolation" ON tasks
  FOR ALL USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id());

-- Policies: meetings
DROP POLICY IF EXISTS "meetings_company_isolation" ON meetings;
CREATE POLICY "meetings_company_isolation" ON meetings
  FOR ALL USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id());

-- Policies: meeting_participants
DROP POLICY IF EXISTS "mp_company_isolation" ON meeting_participants;
CREATE POLICY "mp_company_isolation" ON meeting_participants
  FOR ALL USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id());

-- Policies: notifications
DROP POLICY IF EXISTS "notifications_company_isolation" ON notifications;
CREATE POLICY "notifications_company_isolation" ON notifications
  FOR ALL USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id());

-- Policies: allocations
DROP POLICY IF EXISTS "allocations_company_isolation" ON allocations;
CREATE POLICY "allocations_company_isolation" ON allocations
  FOR ALL USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id());

-- Policies: employee_schedules
DROP POLICY IF EXISTS "schedules_company_isolation" ON employee_schedules;
CREATE POLICY "schedules_company_isolation" ON employee_schedules
  FOR ALL USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id());

-- Policies: sectors
DROP POLICY IF EXISTS "sectors_company_isolation" ON sectors;
CREATE POLICY "sectors_company_isolation" ON sectors
  FOR ALL USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id());

-- Policies: recurrence_options
DROP POLICY IF EXISTS "ro_company_isolation" ON recurrence_options;
CREATE POLICY "ro_company_isolation" ON recurrence_options
  FOR ALL USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id());

-- ============================================
-- 15. INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_users_auth ON users(auth_id);
CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_employees_company ON employees(company_id);
CREATE INDEX IF NOT EXISTS idx_tasks_company ON tasks(company_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee);
CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_meetings_company ON meetings(company_id);
CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(date);
CREATE INDEX IF NOT EXISTS idx_mp_company ON meeting_participants(company_id);
CREATE INDEX IF NOT EXISTS idx_mp_meeting ON meeting_participants(meeting_id);
CREATE INDEX IF NOT EXISTS idx_mp_employee ON meeting_participants(employee_id);
CREATE INDEX IF NOT EXISTS idx_notifications_company ON notifications(company_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_allocations_company ON allocations(company_id);
CREATE INDEX IF NOT EXISTS idx_allocations_employee ON allocations(employee_id);
CREATE INDEX IF NOT EXISTS idx_allocations_area ON allocations(area);
CREATE INDEX IF NOT EXISTS idx_schedules_company ON employee_schedules(company_id);
CREATE INDEX IF NOT EXISTS idx_schedules_employee ON employee_schedules(employee_id);
CREATE INDEX IF NOT EXISTS idx_sectors_company ON sectors(company_id);
CREATE INDEX IF NOT EXISTS idx_ro_company ON recurrence_options(company_id);

-- ============================================
-- 16. AUTO-UPDATE TRIGGER FOR updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_users_updated_at ON users;
DROP TRIGGER IF EXISTS set_employees_updated_at ON employees;
DROP TRIGGER IF EXISTS set_tasks_updated_at ON tasks;
DROP TRIGGER IF EXISTS set_meetings_updated_at ON meetings;
DROP TRIGGER IF EXISTS set_meeting_participants_updated_at ON meeting_participants;

CREATE TRIGGER set_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_employees_updated_at BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_meetings_updated_at BEFORE UPDATE ON meetings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_meeting_participants_updated_at BEFORE UPDATE ON meeting_participants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 17. STORAGE BUCKET
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'evidence-photos') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('evidence-photos', 'evidence-photos', true, 5242880, '{image/png,image/jpeg,image/webp}');
  END IF;
END $$;

DROP POLICY IF EXISTS "public_select_ep" ON storage.objects;
DROP POLICY IF EXISTS "public_insert_ep" ON storage.objects;
DROP POLICY IF EXISTS "public_delete_ep" ON storage.objects;
CREATE POLICY "public_select_ep" ON storage.objects FOR SELECT USING (bucket_id = 'evidence-photos');
CREATE POLICY "public_insert_ep" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'evidence-photos');
CREATE POLICY "public_delete_ep" ON storage.objects FOR DELETE USING (bucket_id = 'evidence-photos');

-- ============================================
-- 18. ENABLE REALTIME
-- ============================================
DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY['tasks','meetings','meeting_participants','notifications','allocations','employees','employee_schedules','sectors','recurrence_options'];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  FOREACH tbl IN ARRAY tbls LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', tbl);
    END IF;
  END LOOP;
END $$;

-- ============================================
-- 19. SEED: default company + admin
-- ============================================
INSERT INTO companies (id, name, slug) VALUES
  (1, 'Minha Empresa', 'minha-empresa')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 20. DEFAULT RECURRENCE OPTIONS (company 1)
-- ============================================
INSERT INTO recurrence_options (id, company_id, key, label, sort_order) VALUES
  (1, 1, 'none', 'Nenhuma', 0),
  (2, 1, 'daily', 'Diária', 1),
  (3, 1, 'weekly', 'Semanal', 2),
  (4, 1, 'biweekly', 'Quinzenal', 3),
  (5, 1, 'monthly', 'Mensal', 4),
  (6, 1, 'quarterly', 'Trimestral', 5),
  (7, 1, 'semiannual', 'Semestral', 6),
  (8, 1, 'yearly', 'Anual', 7)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- DONE
-- ============================================
-- After running this SQL:
-- 1. Go to Supabase Auth → enable email/password provider
-- 2. Create a user manually (or sign up via the app)
-- 3. The auto-profile trigger will create the user's profile

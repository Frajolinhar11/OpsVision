-- ============================================
-- OPS VISION - Complete Database Migration
-- Run this in Supabase SQL Editor
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE (custom auth, no Supabase Auth)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'funcionario' CHECK (type IN ('gestor', 'funcionario')),
  initials TEXT NOT NULL DEFAULT '',
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- EMPLOYEES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS employees (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'free' CHECK (status IN ('free', 'busy', 'task')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- TASKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS tasks (
  id BIGINT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  assignee BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  time TEXT NOT NULL DEFAULT '00:00',
  recurrence TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'daily', 'weekly')),
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
-- MEETINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS meetings (
  id BIGINT PRIMARY KEY,
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
-- MEETING PARTICIPANTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS meeting_participants (
  id BIGINT PRIMARY KEY,
  meeting_id BIGINT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('confirmed', 'absent', 'maybe', 'pending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- NOTIFICATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'task' CHECK (type IN ('task', 'meeting', 'warning')),
  message TEXT NOT NULL DEFAULT '',
  read BOOLEAN NOT NULL DEFAULT FALSE,
  related_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- ALLOCATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS allocations (
  id BIGINT PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  area TEXT CHECK (area IN ('reception', 'operations', 'security', 'maintenance')),
  allocated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- EMPLOYEE SCHEDULE (work days, time-off, vacation)
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employee_schedules') THEN
    CREATE TABLE employee_schedules (
      id BIGINT PRIMARY KEY,
      employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'working' CHECK (type IN ('working', 'day_off', 'vacation')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  ELSE
    -- Migrate old 'date' column to 'start_date' and 'end_date' if needed
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employee_schedules' AND column_name = 'date') THEN
      ALTER TABLE employee_schedules RENAME COLUMN date TO start_date;
      ALTER TABLE employee_schedules ADD COLUMN IF NOT EXISTS end_date TEXT NOT NULL DEFAULT '';
      UPDATE employee_schedules SET end_date = start_date WHERE end_date = '';
    END IF;
    ALTER TABLE employee_schedules ADD COLUMN IF NOT EXISTS end_date TEXT NOT NULL DEFAULT '';
    UPDATE employee_schedules SET end_date = start_date WHERE end_date = '';
  END IF;
  -- Ensure unique constraint for upsert
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_schedules_employee_start_unique') THEN
    ALTER TABLE employee_schedules ADD CONSTRAINT employee_schedules_employee_start_unique UNIQUE (employee_id, start_date);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_employee_schedules_employee ON employee_schedules(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_schedules_dates ON employee_schedules(start_date, end_date);

ALTER TABLE employee_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_employee_schedules" ON employee_schedules;
CREATE POLICY "allow_all_employee_schedules" ON employee_schedules FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- STORAGE BUCKET FOR EVIDENCE PHOTOS
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
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee);
CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(date);
CREATE INDEX IF NOT EXISTS idx_meeting_participants_meeting ON meeting_participants(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_participants_employee ON meeting_participants(employee_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_allocations_employee ON allocations(employee_id);
CREATE INDEX IF NOT EXISTS idx_allocations_area ON allocations(area);
CREATE INDEX IF NOT EXISTS idx_allocations_date ON allocations(allocated_at);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE allocations ENABLE ROW LEVEL SECURITY;

-- ============================================
-- POLICIES - Allow All (development phase)
-- ============================================
DROP POLICY IF EXISTS "allow_all_users" ON users;
DROP POLICY IF EXISTS "allow_all_employees" ON employees;
DROP POLICY IF EXISTS "allow_all_tasks" ON tasks;
DROP POLICY IF EXISTS "allow_all_meetings" ON meetings;
DROP POLICY IF EXISTS "allow_all_meeting_participants" ON meeting_participants;
DROP POLICY IF EXISTS "allow_all_notifications" ON notifications;
DROP POLICY IF EXISTS "allow_all_allocations" ON allocations;
CREATE POLICY "allow_all_users" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_employees" ON employees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_tasks" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_meetings" ON meetings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_meeting_participants" ON meeting_participants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_notifications" ON notifications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_allocations" ON allocations FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- AUTO-UPDATE TRIGGER FOR updated_at
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
-- SEED DATA
-- ============================================
INSERT INTO users (id, name, role, type, initials, username, password) VALUES
  (1, 'Admin OpsFlow', 'Gestor Geral', 'gestor', 'AO', 'gab', '123')
ON CONFLICT (id) DO NOTHING;

INSERT INTO employees (id, name, role, status) VALUES
  (1, 'Carlos Silva', 'Analista Operacional', 'task'),
  (2, 'Ana Oliveira', 'Supervisora', 'task'),
  (3, 'Bruno Costa', 'Técnico de Segurança', 'task'),
  (4, 'Daniela Souza', 'Recepcionista', 'free'),
  (5, 'Eduardo Lima', 'Analista de TI', 'task'),
  (6, 'Fernanda Rocha', 'Coordenadora', 'free'),
  (7, 'Gabriel Santos', 'Auxiliar Adm.', 'busy'),
  (8, 'Helena Martins', 'Analista de RH', 'free'),
  (9, 'Admin OpsFlow', 'Gestor Geral', 'free')
ON CONFLICT (id) DO NOTHING;
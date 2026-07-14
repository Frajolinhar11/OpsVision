-- ============================================
-- Rodar tudo no Supabase SQL Editor (uma vez)
-- ============================================

-- 1. Add 'type' column to employees (so nível de acesso pode ser salvo)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'funcionario';

-- 2. Companies + company_id columns (se ainda não rodou 007)
-- (pule se já rodou 007_saas_clean.sql)

-- 3. Add setup_completed to companies (migration 011)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS setup_completed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;

-- 4. task_assignees table (migration 011)
CREATE TABLE IF NOT EXISTS task_assignees (
  id BIGINT PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  UNIQUE (task_id, employee_id)
);
CREATE INDEX IF NOT EXISTS idx_task_assignees_task ON task_assignees(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_employee ON task_assignees(employee_id);
ALTER PUBLICATION supabase_realtime ADD TABLE task_assignees;
ALTER TABLE task_assignees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ta_company_isolation" ON task_assignees;
CREATE POLICY "ta_company_isolation" ON task_assignees
  FOR ALL USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id());

-- 5. Mark existing companies as setup_completed (so they don't see wizard)
UPDATE companies SET setup_completed = true WHERE setup_completed = false;

-- 6. Insert default sectors for existing companies that have none
INSERT INTO sectors (id, company_id, name, icon, max_capacity, goal, target)
SELECT
  (1000000 + row_number() OVER ()),
  c.id, s.name, s.icon, s.capacity, 0, 0
FROM companies c
CROSS JOIN (
  VALUES ('Recepção', '🏢', 5),
         ('Operações', '⚙️', 10),
         ('Segurança', '🛡️', 8),
         ('Manutenção', '🔧', 6)
) AS s(name, icon, capacity)
WHERE NOT EXISTS (SELECT 1 FROM sectors WHERE company_id = c.id)
ON CONFLICT (id) DO NOTHING;

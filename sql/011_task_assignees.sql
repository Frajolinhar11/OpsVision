-- ============================================
-- 011: Task multi-assignee + company onboarding
-- ============================================

-- Junction table for task multi-assignee
CREATE TABLE IF NOT EXISTS task_assignees (
  id BIGINT PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  UNIQUE (task_id, employee_id)
);

ALTER TABLE companies ADD COLUMN IF NOT EXISTS setup_completed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_task_assignees_task ON task_assignees(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_employee ON task_assignees(employee_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS task_assignees;

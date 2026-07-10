-- ============================================
-- FIX: tasks recurrence CHECK constraint
-- Old constraint only allowed 'none','daily','weekly'
-- New constraint matches recurrence_options table
-- ============================================

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_recurrence_check;

ALTER TABLE tasks ADD CONSTRAINT tasks_recurrence_check
  CHECK (recurrence IN ('none','daily','weekly','biweekly','monthly','quarterly','semiannual','yearly'));

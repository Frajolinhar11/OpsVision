-- OPS Vision - Migration 003
-- Recurrence options for tasks (configurable per company)

CREATE TABLE IF NOT EXISTS recurrence_options (
  id BIGINT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE recurrence_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recurrence_options_select" ON recurrence_options
  FOR SELECT USING (true);

CREATE POLICY "recurrence_options_insert" ON recurrence_options
  FOR INSERT WITH CHECK (true);

CREATE POLICY "recurrence_options_update" ON recurrence_options
  FOR UPDATE USING (true);

CREATE POLICY "recurrence_options_delete" ON recurrence_options
  FOR DELETE USING (true);

-- Default options
INSERT INTO recurrence_options (id, key, label, sort_order) VALUES
  (1, 'none', 'Nenhuma', 0),
  (2, 'daily', 'Diária', 1),
  (3, 'weekly', 'Semanal', 2),
  (4, 'biweekly', 'Quinzenal', 3),
  (5, 'monthly', 'Mensal', 4),
  (6, 'quarterly', 'Trimestral', 5),
  (7, 'semiannual', 'Semestral', 6),
  (8, 'yearly', 'Anual', 7)
ON CONFLICT (id) DO NOTHING;

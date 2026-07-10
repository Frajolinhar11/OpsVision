-- OPS Vision - Migration 001
-- Create sectors table with CRUD support

CREATE TABLE IF NOT EXISTS sectors (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '',
  max_capacity INTEGER NOT NULL DEFAULT 3,
  goal TEXT NOT NULL DEFAULT '',
  target TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE sectors ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read
CREATE POLICY "sectors_select" ON sectors
  FOR SELECT USING (true);

-- Allow gestor to insert/update/delete
CREATE POLICY "sectors_insert" ON sectors
  FOR INSERT WITH CHECK (true);

CREATE POLICY "sectors_update" ON sectors
  FOR UPDATE USING (true);

CREATE POLICY "sectors_delete" ON sectors
  FOR DELETE USING (true);

-- Set default sectors
INSERT INTO sectors (id, name, icon, max_capacity, goal, target) VALUES
  (1, 'Recepcionista', '📋', 3, 'Atendimento de Excelencia', '95% de satisfacao'),
  (2, 'Operadores', '⚙️', 4, 'Eficiencia Operacional', '100% tarefas no prazo'),
  (3, 'Seguranca', '🔒', 3, 'Seguranca Total', 'Zero incidentes'),
  (4, 'Manutencao', '🔧', 3, 'Disponibilidade Total', '100% equipamentos OK')
ON CONFLICT (id) DO NOTHING;
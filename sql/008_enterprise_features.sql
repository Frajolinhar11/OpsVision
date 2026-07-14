-- ============================================
-- OPS VISION - Enterprise Features Migration
-- Run ONCE in Supabase SQL Editor
-- Tables: jornada, goals, quality, audit, feedbacks, documents, automation
-- ============================================

-- ============================================
-- 1. JORNADA (Shift Control)
-- ============================================
CREATE TABLE IF NOT EXISTS jornada (
  id BIGINT PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  check_in TEXT,
  check_out TEXT,
  break_start TEXT,
  break_end TEXT,
  status TEXT NOT NULL DEFAULT 'working' CHECK (status IN ('working','on_break','finished','absent')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, date)
);

-- ============================================
-- 2. GOALS (Metas)
-- ============================================
CREATE TABLE IF NOT EXISTS goals (
  id BIGINT PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  type TEXT NOT NULL CHECK (type IN ('company','sector','employee')),
  target_id BIGINT,
  metric TEXT NOT NULL DEFAULT 'tasks_completed',
  target_value NUMERIC NOT NULL DEFAULT 0,
  current_value NUMERIC NOT NULL DEFAULT 0,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 3. QUALITY RATINGS
-- ============================================
CREATE TABLE IF NOT EXISTS quality_ratings (
  id BIGINT PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  evaluator_id BIGINT NOT NULL REFERENCES employees(id),
  quality_score INTEGER NOT NULL CHECK (quality_score BETWEEN 1 AND 5),
  deadline_score INTEGER NOT NULL CHECK (deadline_score BETWEEN 1 AND 5),
  execution_score INTEGER NOT NULL CHECK (execution_score BETWEEN 1 AND 5),
  comment TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 4. AUDIT LOGS
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  user_id BIGINT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id BIGINT,
  before_data JSONB,
  after_data JSONB,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 5. EMPLOYEE FEEDBACKS
-- ============================================
CREATE TABLE IF NOT EXISTS employee_feedbacks (
  id BIGINT PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  author_id BIGINT NOT NULL REFERENCES employees(id),
  text TEXT NOT NULL,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 6. EMPLOYEE DOCUMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS employee_documents (
  id BIGINT PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'document',
  file_url TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 7. AUTOMATION RULES
-- ============================================
CREATE TABLE IF NOT EXISTS automation_rules (
  id BIGINT PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}',
  action_type TEXT NOT NULL,
  action_config JSONB NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 8. COMPANY DOCUMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS company_documents (
  id BIGINT PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'document',
  category TEXT NOT NULL DEFAULT 'outros' CHECK (category IN ('contrato','procedimento','norma','treinamento','outros')),
  file_url TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- RLS ENABLE
-- ============================================
ALTER TABLE jornada ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_feedbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_documents ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES (company isolation)
-- ============================================
CREATE POLICY "jornada_company_isolation" ON jornada FOR ALL USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id());
CREATE POLICY "goals_company_isolation" ON goals FOR ALL USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id());
CREATE POLICY "quality_ratings_company_isolation" ON quality_ratings FOR ALL USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id());
CREATE POLICY "audit_logs_company_isolation" ON audit_logs FOR ALL USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id());
CREATE POLICY "employee_feedbacks_company_isolation" ON employee_feedbacks FOR ALL USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id());
CREATE POLICY "employee_documents_company_isolation" ON employee_documents FOR ALL USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id());
CREATE POLICY "automation_rules_company_isolation" ON automation_rules FOR ALL USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id());
CREATE POLICY "company_documents_company_isolation" ON company_documents FOR ALL USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id());

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_jornada_employee ON jornada(employee_id);
CREATE INDEX IF NOT EXISTS idx_jornada_date ON jornada(date);
CREATE INDEX IF NOT EXISTS idx_jornada_status ON jornada(status);
CREATE INDEX IF NOT EXISTS idx_goals_type ON goals(type);
CREATE INDEX IF NOT EXISTS idx_goals_period ON goals(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_quality_task ON quality_ratings(task_id);
CREATE INDEX IF NOT EXISTS idx_quality_evaluator ON quality_ratings(evaluator_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_feedbacks_employee ON employee_feedbacks(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_docs_employee ON employee_documents(employee_id);

-- ============================================
-- REALTIME PUBLICATION
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE jornada;
ALTER PUBLICATION supabase_realtime ADD TABLE goals;
ALTER PUBLICATION supabase_realtime ADD TABLE quality_ratings;
ALTER PUBLICATION supabase_realtime ADD TABLE audit_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE employee_feedbacks;
ALTER PUBLICATION supabase_realtime ADD TABLE employee_documents;

-- ============================================
-- TRIGGERS
-- ============================================
CREATE TRIGGER set_jornada_updated_at BEFORE UPDATE ON jornada FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_goals_updated_at BEFORE UPDATE ON goals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_automation_rules_updated_at BEFORE UPDATE ON automation_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

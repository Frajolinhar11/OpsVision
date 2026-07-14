-- ============================================
-- 010: Document assignment, preview & signature
-- ============================================

ALTER TABLE company_documents ADD COLUMN IF NOT EXISTS employee_id BIGINT REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE company_documents ADD COLUMN IF NOT EXISTS signed_by TEXT NOT NULL DEFAULT '';
ALTER TABLE company_documents ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;

-- Employee sector assignment (from allocations)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS sector_name TEXT NOT NULL DEFAULT '';

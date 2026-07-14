-- ============================================
-- 012: Company settings columns
-- Run in Supabase SQL Editor
-- ============================================

ALTER TABLE companies ADD COLUMN IF NOT EXISTS cnpj TEXT NOT NULL DEFAULT '';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url TEXT NOT NULL DEFAULT '';

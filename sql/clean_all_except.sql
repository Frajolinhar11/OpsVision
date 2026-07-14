-- ============================================
-- LIMPAR TODOS OS DADOS
-- Mantém apenas a empresa 1784034149473
-- e seus usuários (para ainda poder logar)
-- ============================================

DO $$
DECLARE
  cid BIGINT := 1784034149473;
BEGIN

  RAISE NOTICE 'Limpando dados de todas as empresas exceto %...', cid;

  -- 1. Tabelas com company_id (deletar tudo de outras empresas + dados da empresa alvo)
  DELETE FROM quality_ratings      WHERE company_id != cid OR company_id = cid;
  DELETE FROM audit_logs           WHERE company_id != cid OR company_id = cid;
  DELETE FROM employee_feedbacks   WHERE company_id != cid OR company_id = cid;
  DELETE FROM company_documents    WHERE company_id != cid OR company_id = cid;
  DELETE FROM automation_rules     WHERE company_id != cid OR company_id = cid;
  DELETE FROM task_assignees       WHERE company_id != cid OR company_id = cid;
  DELETE FROM tasks                WHERE company_id != cid OR company_id = cid;
  DELETE FROM goals                WHERE company_id != cid OR company_id = cid;
  DELETE FROM meeting_participants WHERE company_id != cid OR company_id = cid;
  DELETE FROM meetings             WHERE company_id != cid OR company_id = cid;
  DELETE FROM notifications        WHERE company_id != cid OR company_id = cid;
  DELETE FROM allocations          WHERE company_id != cid OR company_id = cid;
  DELETE FROM employee_schedules   WHERE company_id != cid OR company_id = cid;
  DELETE FROM sectors              WHERE company_id != cid OR company_id = cid;
  DELETE FROM recurrence_options   WHERE company_id != cid OR company_id = cid;
  DELETE FROM employees            WHERE company_id != cid OR company_id = cid;

  -- 2. Usuários de outras empresas (mantém os da empresa alvo para login)
  DELETE FROM users WHERE company_id != cid;

  -- 3. Outras empresas (exceto a alvo)
  DELETE FROM companies WHERE id != cid;

  -- 4. Resetar setup da empresa alvo para wizard reaparecer se quiser
  UPDATE companies SET setup_completed = false, onboarded_at = NULL WHERE id = cid;

  RAISE NOTICE 'Limpeza concluída! Empresa % mantida com usuários.', cid;
  RAISE NOTICE 'Execute o script seed_factory.sql para popular dados de exemplo.';

END $$;

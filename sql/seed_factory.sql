-- ============================================
-- Seed: Fábrica Example para company 1784034149473
-- Execute no Supabase SQL Editor
-- ============================================

DO $$
DECLARE
  cid BIGINT := 1784034149473;
  sid INT;
  eid INT;
  tid INT;
  gid INT;
  mid INT;
BEGIN

-- ============================================
-- 1. SECTORS (setores da fábrica)
-- ============================================
INSERT INTO sectors (id, company_id, name, icon, max_capacity, goal, target) VALUES
  (cid + 100, cid, 'Produção',       '🏭', 20, 150, 200),
  (cid + 101, cid, 'Qualidade',      '🔬', 8,  50,  60),
  (cid + 102, cid, 'Manutenção',     '🔧', 6,  30,  40),
  (cid + 103, cid, 'Logística',      '🚚', 10, 40,  50),
  (cid + 104, cid, 'Administração',  '📊', 6,  20,  25),
  (cid + 105, cid, 'Almoxarifado',   '📦', 5,  25,  30)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 2. EMPLOYEES (funcionários)
-- ============================================
INSERT INTO employees (id, company_id, name, role, status) VALUES
  (cid + 1,  cid, 'Carlos Mendes',      'Líder de Produção',    'free'),
  (cid + 2,  cid, 'Ana Beatriz',        'Operadora de Máquinas','task'),
  (cid + 3,  cid, 'José Ricardo',       'Operador de Máquinas', 'task'),
  (cid + 4,  cid, 'Marina Oliveira',    'Inspetora de Qualidade','free'),
  (cid + 5,  cid, 'Rafael Santos',      'Técnico de Qualidade', 'free'),
  (cid + 6,  cid, 'Felipe Andrade',     'Mecânico Industrial',  'busy'),
  (cid + 7,  cid, 'Douglas Lima',       'Eletricista',          'free'),
  (cid + 8,  cid, 'Tatiane Costa',      'Coordenadora Logística','free'),
  (cid + 9,  cid, 'Lucas Pereira',      'Auxiliar de Logística', 'task'),
  (cid + 10, cid, 'Patrícia Souza',     'Analista Adm.',        'free'),
  (cid + 11, cid, 'Roberto Almeida',    'Gerente Administrativo','free'),
  (cid + 12, cid, 'Juliana Castro',     'Auxiliar Adm.',        'busy'),
  (cid + 13, cid, 'Marcos Paulo',       'Almoxarife',           'free'),
  (cid + 14, cid, 'Sandra Vieira',      'Auxiliar Almoxarifado','free'),
  (cid + 15, cid, 'Thiago Nunes',       'Supervisor Geral',     'free'),
  (cid + 16, cid, 'Admin OpsVision',    'Gestor',               'free')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 3. ALLOCATIONS (alocação por setor)
-- ============================================
INSERT INTO allocations (id, company_id, employee_id, area, allocated_at) VALUES
  -- Produção
  (cid + 200, cid, cid + 1,  'Produção',       NOW() - INTERVAL '60 days'),
  (cid + 201, cid, cid + 2,  'Produção',       NOW() - INTERVAL '60 days'),
  (cid + 202, cid, cid + 3,  'Produção',       NOW() - INTERVAL '60 days'),
  -- Qualidade
  (cid + 203, cid, cid + 4,  'Qualidade',      NOW() - INTERVAL '60 days'),
  (cid + 204, cid, cid + 5,  'Qualidade',      NOW() - INTERVAL '60 days'),
  -- Manutenção
  (cid + 205, cid, cid + 6,  'Manutenção',     NOW() - INTERVAL '60 days'),
  (cid + 206, cid, cid + 7,  'Manutenção',     NOW() - INTERVAL '60 days'),
  -- Logística
  (cid + 207, cid, cid + 8,  'Logística',      NOW() - INTERVAL '60 days'),
  (cid + 208, cid, cid + 9,  'Logística',      NOW() - INTERVAL '60 days'),
  -- Administração
  (cid + 209, cid, cid + 10, 'Administração',   NOW() - INTERVAL '60 days'),
  (cid + 210, cid, cid + 11, 'Administração',   NOW() - INTERVAL '60 days'),
  (cid + 211, cid, cid + 12, 'Administração',   NOW() - INTERVAL '60 days'),
  -- Almoxarifado
  (cid + 212, cid, cid + 13, 'Almoxarifado',    NOW() - INTERVAL '60 days'),
  (cid + 213, cid, cid + 14, 'Almoxarifado',    NOW() - INTERVAL '60 days'),
  -- Supervisão (alocado geral)
  (cid + 214, cid, cid + 15, 'Produção',        NOW() - INTERVAL '60 days')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 4. EMPLOYEE SCHEDULES (escalas)
-- ============================================
INSERT INTO employee_schedules (id, company_id, employee_id, start_date, end_date, type) VALUES
  -- Todos trabalhando este mês
  (cid + 300, cid, cid + 1,  '2026-07-01', '2026-07-31', 'working'),
  (cid + 301, cid, cid + 2,  '2026-07-01', '2026-07-31', 'working'),
  (cid + 302, cid, cid + 3,  '2026-07-01', '2026-07-31', 'working'),
  (cid + 303, cid, cid + 4,  '2026-07-01', '2026-07-31', 'working'),
  (cid + 304, cid, cid + 5,  '2026-07-01', '2026-07-31', 'working'),
  (cid + 305, cid, cid + 6,  '2026-07-01', '2026-07-31', 'working'),
  (cid + 306, cid, cid + 7,  '2026-07-01', '2026-07-31', 'working'),
  (cid + 307, cid, cid + 8,  '2026-07-01', '2026-07-31', 'working'),
  (cid + 308, cid, cid + 9,  '2026-07-01', '2026-07-31', 'working'),
  (cid + 309, cid, cid + 10, '2026-07-01', '2026-07-31', 'working'),
  (cid + 310, cid, cid + 11, '2026-07-01', '2026-07-31', 'working'),
  (cid + 311, cid, cid + 12, '2026-07-01', '2026-07-31', 'working'),
  (cid + 312, cid, cid + 13, '2026-07-01', '2026-07-31', 'working'),
  (cid + 313, cid, cid + 14, '2026-07-01', '2026-07-31', 'working'),
  (cid + 314, cid, cid + 15, '2026-07-01', '2026-07-31', 'working'),
  -- Folgas escaladas
  (cid + 315, cid, cid + 2,  '2026-07-12', '2026-07-12', 'day_off'),
  (cid + 316, cid, cid + 9,  '2026-07-19', '2026-07-20', 'day_off'),
  (cid + 317, cid, cid + 13, '2026-07-05', '2026-07-10', 'vacation')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 5. TASKS (tarefas)
-- ============================================
-- Helper: generate task IDs
-- Tarefas da produção
INSERT INTO tasks (id, company_id, title, description, assignee, date, time, recurrence, requires_evidence, requires_photo, status, evidence_description, created_at) VALUES
  (cid + 400, cid, 'Troca de molde da injetora A',          'Substituir molde #2041 para lote 789.',              cid + 2,  '2026-07-14', '08:00', 'none',     true, false, 'completed', 'Molde trocado e calibrado.', NOW() - INTERVAL '5 days'),
  (cid + 401, cid, 'Inspeção visual de 200 peças',          'Verificar rebarbas e trincas no lote 788.',          cid + 4,  '2026-07-14', '10:30', 'none',     true, true,  'completed', 'Lote aprovado — 2 peças descartadas.', NOW() - INTERVAL '5 days'),
  (cid + 402, cid, 'Lubrificação da esteira rolante',       'Aplicar graxa nos rolamentos da esteira 3.',          cid + 6,  '2026-07-14', '13:00', 'weekly',   true, false, 'pending',   '', NOW() - INTERVAL '4 days'),
  (cid + 403, cid, 'Separar pedidos do dia',                'Separar 5 pedidos da fila para expedição.',          cid + 9,  '2026-07-14', '07:00', 'daily',    false, false, 'pending',   '', NOW() - INTERVAL '4 days'),
  (cid + 404, cid, 'Conferir estoque de parafusos M8',      'Contagem física do estoque.',                         cid + 13, '2026-07-14', '09:00', 'weekly',   false, false, 'completed', 'Estoque OK — 5.200 unidades.', NOW() - INTERVAL '3 days'),
  (cid + 405, cid, 'Relatório de produtividade semanal',    'Compilar dados da semana.',                           cid + 11, '2026-07-14', '17:00', 'weekly',   false, false, 'completed', 'Relatório enviado.', NOW() - INTERVAL '3 days'),
  (cid + 406, cid, 'Calibração do paquímetro digital',      'Ajustar conforme padrão ISO.',                        cid + 5,  '2026-07-15', '08:30', 'none',     true, true,  'completed', 'Calibração aprovada.', NOW() - INTERVAL '2 days'),
  (cid + 407, cid, 'Verificar motor do exaustor',           'Barulho anormal relatado pela produção.',             cid + 7,  '2026-07-15', '11:00', 'none',     true, false, 'completed', 'Rolamento trocado.', NOW() - INTERVAL '2 days'),
  (cid + 408, cid, 'Acompanhar carga CT-e 45678',           'Caminhão chegando 14h — conferir nota fiscal.',       cid + 8,  '2026-07-16', '13:30', 'none',     false, false, 'completed', 'Carga conferida e liberada.', NOW() - INTERVAL '1 day'),
  (cid + 409, cid, 'Auditoria interna de qualidade',         'Revisar procedimentos do setor.',                     cid + 4,  '2026-07-17', '09:00', 'none',     true, true,  'pending',   '', NOW() - INTERVAL '1 day'),
  (cid + 410, cid, 'Revisar metas mensais da produção',      'Comparar realizado vs planejado.',                    cid + 1,  '2026-07-18', '14:00', 'none',     false, false, 'pending',   '', NOW()),
  (cid + 411, cid, 'Organizar almoxarifado',                 'Reorganizar prateleiras A1-A4.',                      cid + 14, '2026-07-18', '08:00', 'none',     false, false, 'pending',   '', NOW()),
  (cid + 412, cid, 'Teste de resistência lote 790',          'Amostragem de 10 peças.',                             cid + 5,  '2026-07-21', '10:00', 'none',     true, true,  'in_progress', '', NOW()),
  (cid + 413, cid, 'Planejamento de manutenção preventiva',  'Programar paradas do mês seguinte.',                  cid + 6,  '2026-07-22', '09:00', 'none',     false, false, 'pending',   '', NOW()),
  (cid + 414, cid, 'Atualizar planilha de horas',            'Lançar horas extras da equipe.',                      cid + 12, '2026-07-22', '16:00', 'weekly',   false, false, 'pending',   '', NOW()),
  -- Overdue task (atrasada)
  (cid + 415, cid, 'Limpeza dos filtros do compressor',      'Urgente — compressor superaquecendo.',                cid + 7,  '2026-07-10', '08:00', 'none',     true, true,  'pending',   '', NOW() - INTERVAL '6 days')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 6. TASK ASSIGNEES (multi-responsáveis)
-- ============================================
INSERT INTO task_assignees (id, company_id, task_id, employee_id) VALUES
  (cid + 500, cid, cid + 400, cid + 2),
  (cid + 501, cid, cid + 400, cid + 3),
  (cid + 502, cid, cid + 409, cid + 4),
  (cid + 503, cid, cid + 409, cid + 5),
  (cid + 504, cid, cid + 412, cid + 5),
  (cid + 505, cid, cid + 412, cid + 4),
  (cid + 506, cid, cid + 413, cid + 6),
  (cid + 507, cid, cid + 413, cid + 7)
ON CONFLICT (task_id, employee_id) DO NOTHING;

-- ============================================
-- 7. GOALS (metas)
-- ============================================
INSERT INTO goals (id, company_id, type, target_id, metric, target_value, current_value, period_start, period_end, label) VALUES
  (cid + 600, cid, 'sector',   cid + 100, 'tasks_completed', 200, 45,  '2026-07-01', '2026-07-31', 'Produção Mensal'),
  (cid + 601, cid, 'sector',   cid + 101, 'tasks_completed', 60,  12,  '2026-07-01', '2026-07-31', 'Qualidade'),
  (cid + 602, cid, 'sector',   cid + 102, 'manual',          40,  8,   '2026-07-01', '2026-07-31', 'Manutenções'),
  (cid + 603, cid, 'sector',   cid + 103, 'tasks_completed', 50,  10,  '2026-07-01', '2026-07-31', 'Expedições'),
  (cid + 604, cid, 'sector',   cid + 104, 'manual',          25,  5,   '2026-07-01', '2026-07-31', 'Meta Administrativa')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 8. MEETINGS (reuniões)
-- ============================================
INSERT INTO meetings (id, company_id, title, description, date, time, duration) VALUES
  (cid + 700, cid, 'Reunião de Produção',     'Acompanhamento semanal da produção.',         '2026-07-15', '09:00', 45),
  (cid + 701, cid, 'DDS — Diálogo Diário',    'Segurança no trabalho.',                     '2026-07-16', '07:30', 15),
  (cid + 702, cid, 'Planejamento Mensal',     'Metas e indicadores do mês.',                '2026-07-18', '14:00', 60),
  (cid + 703, cid, 'Treinamento: NR-12',      'Segurança em máquinas.',                     '2026-07-22', '08:00', 120)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 9. MEETING PARTICIPANTS
-- ============================================
INSERT INTO meeting_participants (id, company_id, meeting_id, employee_id, status) VALUES
  (cid + 800, cid, cid + 700, cid + 1,  'confirmed'),
  (cid + 801, cid, cid + 700, cid + 4,  'confirmed'),
  (cid + 802, cid, cid + 700, cid + 15, 'confirmed'),
  (cid + 803, cid, cid + 700, cid + 8,  'confirmed'),
  (cid + 804, cid, cid + 701, cid + 15, 'confirmed'),
  (cid + 805, cid, cid + 701, cid + 2,  'confirmed'),
  (cid + 806, cid, cid + 701, cid + 3,  'confirmed'),
  (cid + 807, cid, cid + 701, cid + 6,  'confirmed'),
  (cid + 808, cid, cid + 701, cid + 9,  'confirmed'),
  (cid + 809, cid, cid + 702, cid + 11, 'confirmed'),
  (cid + 810, cid, cid + 702, cid + 15, 'confirmed'),
  (cid + 811, cid, cid + 702, cid + 1,  'confirmed'),
  (cid + 812, cid, cid + 703, cid + 6,  'confirmed'),
  (cid + 813, cid, cid + 703, cid + 7,  'confirmed'),
  (cid + 814, cid, cid + 703, cid + 3,  'confirmed')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 10. QUALITY RATINGS (avaliações)
-- ============================================
INSERT INTO quality_ratings (id, company_id, task_id, quality_score, deadline_score, execution_score, comment, evaluator_id, created_at) VALUES
  (cid + 900, cid, cid + 400, 5, 5, 4, 'Troca realizada dentro do prazo.',           cid + 15, NOW() - INTERVAL '4 days'),
  (cid + 901, cid, cid + 401, 5, 4, 5, 'Inspeção criteriosa, lote OK.',               cid + 15, NOW() - INTERVAL '4 days'),
  (cid + 902, cid, cid + 404, 4, 5, 4, 'Estoque conferido corretamente.',             cid + 11, NOW() - INTERVAL '2 days'),
  (cid + 903, cid, cid + 405, 5, 5, 5, 'Relatório completo e dentro do prazo.',       cid + 15, NOW() - INTERVAL '2 days'),
  (cid + 904, cid, cid + 406, 5, 5, 5, 'Calibração dentro dos padrões.',              cid + 4,  NOW() - INTERVAL '1 day'),
  (cid + 905, cid, cid + 407, 4, 4, 5, 'Serviço concluído, exaustor funcionando.',    cid + 1,  NOW() - INTERVAL '1 day'),
  (cid + 906, cid, cid + 408, 5, 5, 5, 'Carga conferida e liberada sem pendências.',  cid + 15, NOW())
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 11. NOTIFICATIONS
-- ============================================
INSERT INTO notifications (id, company_id, type, message, read, created_at) VALUES
  (cid + 1000, cid, 'task',     '📋 Nova tarefa: <strong>Troca de molde</strong> atribuída a Carlos Mendes.', false, NOW() - INTERVAL '5 days'),
  (cid + 1001, cid, 'task',     '✅ <strong>Troca de molde</strong> concluída por Carlos Mendes.',            false, NOW() - INTERVAL '5 days'),
  (cid + 1002, cid, 'task',     '📋 Nova tarefa: <strong>Inspeção visual</strong> atribuída a Marina Oliveira.', false, NOW() - INTERVAL '5 days'),
  (cid + 1003, cid, 'warning',  '⚠️ Tarefa <strong>Limpeza dos filtros</strong> está atrasada!',               false, NOW() - INTERVAL '3 days'),
  (cid + 1004, cid, 'meeting',  '📅 Reunião: <strong>Produção Semanal</strong> amanhã às 09h.',                false, NOW() - INTERVAL '1 day'),
  (cid + 1005, cid, 'task',     '⭐ Avaliação registrada para <strong>Troca de molde</strong>: 5/5.',          false, NOW() - INTERVAL '4 days')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 12. Mark company as setup completed
-- ============================================
UPDATE companies SET setup_completed = true, onboarded_at = NOW() WHERE id = cid;

-- ============================================
-- Summary
-- ============================================
RAISE NOTICE '============================================';
RAISE NOTICE 'Seed concluído para company %', cid;
RAISE NOTICE 'Setores: 6 | Funcionários: 16 | Tarefas: 16 | Alocações: 15';
RAISE NOTICE 'Metas: 5 | Reuniões: 4 | Avaliações: 7 | Notificações: 6';
RAISE NOTICE '============================================';

END $$;

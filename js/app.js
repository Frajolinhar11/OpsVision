/* ============================================
   OPS VISION - Application Logic
   Powered by Supabase | No localStorage
   ============================================ */

const App = {
  state: {
    user: null,
    currentPage: 'dashboard',
    notificationsCount: 0,
    agendaWeekOffset: 0,
    period: 'month',
    periodCustomStart: '',
    periodCustomEnd: '',
    mapDate: null,
    mapOverviewPeriod: 'today',
    ovCustomStart: '',
    ovCustomEnd: '',
  }
};

/* ============================================
   CACHE (read-through from Supabase)
   ============================================ */
let _cache = { employees: null, tasks: null, meetings: null, participants: null, notifications: null, allocations: null, sectors: null, recurrenceOptions: null };

async function loadCache() {
  const [employees, tasks, meetings, participants, notifications, allocations] = await Promise.all([
    db.getEmployees(),
    db.getTasks(),
    db.getMeetings(),
    db.getAllParticipants(),
    db.getNotifications(),
    db.getAllocations(),
  ]);
  _cache.employees = employees;
  _cache.tasks = tasks;
  _cache.meetings = meetings;
  _cache.participants = participants;
  _cache.notifications = notifications;
  _cache.allocations = allocations;
}

function invalidateCache(keys) {
  (Array.isArray(keys) ? keys : [keys]).forEach(k => { _cache[k] = null; });
}

async function ensureCache(key, fetcher) {
  if (!_cache[key]) {
    _cache[key] = await fetcher();
  }
  return _cache[key];
}

async function getCachedEmployees() {
  return ensureCache('employees', db.getEmployees);
}
async function getCachedTasks() {
  return ensureCache('tasks', db.getTasks);
}
async function getCachedMeetings() {
  return ensureCache('meetings', db.getMeetings);
}
async function getCachedParticipants() {
  return ensureCache('participants', db.getAllParticipants);
}
async function getCachedNotifications() {
  return ensureCache('notifications', db.getNotifications);
}
async function getCachedAllocations() {
  return ensureCache('allocations', db.getAllocations);
}
async function getCachedSchedules() {
  return ensureCache('schedules', db.getSchedules);
}
async function getCachedSectors() {
  return ensureCache('sectors', db.getSectors);
}
async function getCachedRecurrenceOptions() {
  return ensureCache('recurrenceOptions', db.getRecurrenceOptions);
}
async function getCachedTaskAssignees() {
  return ensureCache('taskAssignees', db.getAllTaskAssignees);
}

async function assigneeNames(task) {
  const emp = await getCachedEmployees();
  const all = await getCachedTaskAssignees() || [];
  const ids = all.filter(a => a.task_id === task.id).map(a => a.employee_id);
  if (!ids.length && task.assignee) ids.push(task.assignee);
  return ids.length ? ids.map(id => emp.find(e => e.id === id)?.name || '—').join(', ') : '—';
}

async function taskAssigneeIds(taskId) {
  const all = await getCachedTaskAssignees() || [];
  const ids = all.filter(a => a.task_id === taskId).map(a => a.employee_id);
  return ids.length ? ids : null;
}

function isWorkingDay(schedules, employeeId, dateStr) {
  const s = schedules.find(s => s.employee_id === employeeId && s.start_date <= dateStr && s.end_date >= dateStr);
  if (!s) return true; // default: working
  return s.type === 'working';
}

/* ============================================
   UTILITY FUNCTIONS
   ============================================ */
function formatDateTime(str) {
  if (!str) return '';
  const d = new Date(str);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(str) {
  if (!str) return '';
  const d = new Date(str + 'T12:00:00');
  return d.toLocaleDateString('pt-BR');
}

function todayBrasil() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function nowBrasilISO() {
  const d = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  const p = fmt.formatToParts(d);
  const g = t => p.find(x => x.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:${g('second')}.000Z`;
}

function nowBrasilTime() {
  const d = new Date();
  return d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
}

function addRecurrence(dateStr, recurrence) {
  if (recurrence === 'none') return dateStr;
  const d = new Date(dateStr + 'T12:00:00');
  switch (recurrence) {
    case 'daily': d.setDate(d.getDate() + 1); break;
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'biweekly': d.setDate(d.getDate() + 14); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'semiannual': d.setMonth(d.getMonth() + 6); break;
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
    default: return dateStr;
  }
  return d.toISOString().slice(0, 10);
}

async function generateRecurringTasks() {
  try {
    const tasks = await getCachedTasks();
    const today = todayBrasil();
    const recurring = tasks.filter(t => t.recurrence && t.recurrence !== 'none');
    if (!recurring.length) return;

    let created = 0;
    for (const task of recurring) {
      // Walk forward from task date up to today; create today's instance if missing
      let current = task.date;
      while (current < today) {
        const next = addRecurrence(current, task.recurrence);
        if (next === current) break;
        current = next;
      }
      // current is now >= today; only care about today
      if (current !== today) continue;
      const exists = tasks.some(t =>
        t.title === task.title && t.assignee === task.assignee &&
        t.date === current && t.id !== task.id
      );
      if (!exists) {
        await db.insertTask({
          id: uid(), title: task.title, description: task.description,
          assignee: task.assignee, date: current, time: task.time,
          recurrence: task.recurrence,
          requires_evidence: task.requires_evidence,
          requires_photo: task.requires_photo,
          status: 'pending', evidence_photo: '', evidence_description: '',
          evidence_timestamp: null, created_at: nowBrasilISO(),
        });
        created++;
      }
    }
    if (created) {
      invalidateCache('tasks');
    }
  } catch (e) { console.warn('generateRecurringTasks:', e); }
}

function formatTime(str) {
  if (!str) return '';
  const parts = str.split(':');
  return parts[0] + ':' + parts[1];
}

function getEmployeeName(id, employees) {
  const emp = employees.find(e => e.id === id);
  return emp ? emp.name : 'Desconhecido';
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

const ROLES = {
  proprietario: { level: 5, label: 'Proprietário', canManage: true, canConfig: true, canDelete: true },
  gerente: { level: 4, label: 'Gerente', canManage: true, canConfig: true, canDelete: false },
  gestor: { level: 4, label: 'Gestor', canManage: true, canConfig: true, canDelete: false },
  supervisor: { level: 3, label: 'Supervisor', canManage: true, canConfig: false, canDelete: false },
  funcionario: { level: 2, label: 'Funcionário', canManage: false, canConfig: false, canDelete: false },
  auditor: { level: 1, label: 'Auditor', canManage: false, canConfig: false, canDelete: false },
};

function hasRole(minRole) {
  const u = App.state.user;
  if (!u) return false;
  const role = ROLES[u.type] || ROLES.funcionario;
  return role.level >= ROLES[minRole].level;
}

function isGestor() {
  return App.state.user && hasRole('supervisor');
}

function isFuncionario() {
  return App.state.user && App.state.user.type === 'funcionario';
}

function getRoleLabel(type) {
  return ROLES[type]?.label || type || 'Funcionário';
}

const ROLE_ORDER = ['funcionario', 'auditor', 'supervisor', 'gerente', 'proprietario'];

function currentUserId() {
  return App.state.user ? App.state.user.id : null;
}

function randomColor(name) {
  const colors = ['#3b82f6','#6366f1','#8b5cf6','#ec4899','#ef4444','#f59e0b','#10b981','#06b6d4'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function statusLabel(s) {
  return { pending: 'Pendente', in_progress: 'Em Andamento', completed: 'Concluído' }[s] || s;
}

function recurrenceLabel(key) {
  const labels = {
    none: '', daily: 'Diária', weekly: 'Semanal', biweekly: 'Quinzenal',
    monthly: 'Mensal', quarterly: 'Trimestral', semiannual: 'Semestral',
    yearly: 'Anual'
  };
  return labels[key] || key;
}

function recurrenceOptions() {
  const custom = App.state.recurrenceOptions;
  if (custom && custom.length > 0) return custom;
  return [
    { key: 'none', label: 'Nenhuma', sort_order: 0 },
    { key: 'daily', label: 'Diária', sort_order: 1 },
    { key: 'weekly', label: 'Semanal', sort_order: 2 },
    { key: 'biweekly', label: 'Quinzenal', sort_order: 3 },
    { key: 'monthly', label: 'Mensal', sort_order: 4 },
    { key: 'quarterly', label: 'Trimestral', sort_order: 5 },
    { key: 'semiannual', label: 'Semestral', sort_order: 6 },
    { key: 'yearly', label: 'Anual', sort_order: 7 },
  ];
}

/* ============================================
   SECTOR GOALS (defaults, overridden from DB)
   ============================================ */
let sectorGoals = {
  reception:    { goal: 'Atendimento de Excelencia',   target: '95% de satisfacao',    icon: '' },
  operations:   { goal: 'Eficiencia Operacional',      target: '100% tarefas no prazo', icon: '' },
  security:     { goal: 'Seguranca Total',             target: 'Zero incidentes',       icon: '' },
  maintenance:  { goal: 'Disponibilidade Total',       target: '100% equipamentos OK',  icon: '' },
};

let areasList = [
  { id: 'reception', name: 'Recepcao', icon: '', maxCapacity: 3 },
  { id: 'operations', name: 'Operacoes', icon: '', maxCapacity: 4 },
  { id: 'security', name: 'Seguranca', icon: '', maxCapacity: 3 },
  { id: 'maintenance', name: 'Manutencao', icon: '', maxCapacity: 3 },
];

async function loadSectorsFromDB() {
  try {
    const sectors = await getCachedSectors();
    if (sectors && sectors.length > 0) {
      areasList = sectors.map(s => ({ id: s.id.toString(), name: s.name, icon: s.icon || '', maxCapacity: s.max_capacity }));
      sectorGoals = {};
      sectors.forEach(s => {
        sectorGoals[s.id.toString()] = { goal: s.goal || '', target: s.target || '', icon: s.icon || '' };
      });
    }
  } catch (e) {
    // keep defaults
  }
}

/* ============================================
   PERFORMANCE
   ============================================ */
async function getEmployeePerformance(empId, tasks, meetings, participants) {
  if (!tasks) tasks = await getCachedTasks();
  if (!meetings) meetings = await getCachedMeetings();
  if (!participants) participants = await getCachedParticipants();

  const empTasks = tasks.filter(t => t.assignee === empId);
  const now = todayBrasil();
  const total = empTasks.length;
  const completed = empTasks.filter(t => t.status === 'completed').length;
  const pending = empTasks.filter(t => t.status === 'pending').length;
  const inProgress = empTasks.filter(t => t.status === 'in_progress').length;
  const overdue = empTasks.filter(t => t.status !== 'completed' && t.date < now).length;
  const rate = total > 0 ? Math.round(completed / total * 100) : 0;

  const empMeetingIds = participants.filter(p => p.employee_id === empId).map(p => p.meeting_id);
  const empMeetings = meetings.filter(m => empMeetingIds.includes(m.id));
  const attended = participants.filter(p => p.employee_id === empId && p.status === 'confirmed').length;
  const meetingRate = empMeetings.length > 0 ? Math.round(attended / empMeetings.length * 100) : 0;

  return { total, completed, pending, inProgress, overdue, rate, meetings: empMeetings.length, attended, meetingRate };
}

async function getAreaPerformance(areaId, allocations, employees, tasks) {
  if (!allocations) allocations = await getCachedAllocations();
  if (!employees) employees = await getCachedEmployees();
  if (!tasks) tasks = await getCachedTasks();

  const areaAllocs = allocations.filter(a => a.area === areaId);
  const empIds = areaAllocs.map(a => a.employee_id);
  const areaTasks = tasks.filter(t => empIds.includes(t.assignee));
  const now = todayBrasil();
  const total = areaTasks.length;
  const completed = areaTasks.filter(t => t.status === 'completed').length;
  const overdue = areaTasks.filter(t => t.status !== 'completed' && t.date < now).length;
  const rate = total > 0 ? Math.round(completed / total * 100) : 0;
  return { employeeCount: new Set(empIds).size, totalTasks: total, completedTasks: completed, overdueTasks: overdue, completionRate: rate };
}

function perfColor(rate) {
  if (rate >= 80) return '#10b981';
  if (rate >= 50) return '#f59e0b';
  return '#ef4444';
}

/* ============================================
   PERIOD / DATE RANGE
   ============================================ */
function getDateRange(period) {
  const today = todayBrasil();
  let start, end;

  switch (period) {
    case 'today': start = today; end = today; break;
    case 'tomorrow': {
      const t = new Date(today + 'T12:00:00');
      t.setDate(t.getDate() + 1);
      start = t.toISOString().slice(0, 10); end = start; break;
    }
    case 'week': {
      const d = new Date(today + 'T12:00:00');
      const day = d.getDay();
      d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
      start = d.toISOString().slice(0, 10); end = today; break;
    }
    case 'nextWeek': {
      const d = new Date(today + 'T12:00:00');
      const day = d.getDay();
      d.setDate(d.getDate() - (day === 0 ? 6 : day - 1) + 7);
      start = d.toISOString().slice(0, 10);
      d.setDate(d.getDate() + 6);
      end = d.toISOString().slice(0, 10); break;
    }
    case 'month': {
      const d = new Date(today + 'T12:00:00');
      start = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
      end = today; break;
    }
    case 'nextMonth': {
      const d = new Date(today + 'T12:00:00');
      const firstDay = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 2, 0);
      start = firstDay.toISOString().slice(0, 10); end = lastDay.toISOString().slice(0, 10); break;
    }
    case 'last7': {
      const d = new Date(today + 'T12:00:00');
      d.setDate(d.getDate() - 6);
      start = d.toISOString().slice(0, 10); end = today; break;
    }
    case 'last30': {
      const d = new Date(today + 'T12:00:00');
      d.setDate(d.getDate() - 29);
      start = d.toISOString().slice(0, 10); end = today; break;
    }
    case 'custom':
      start = App.state.ovCustomStart || today;
      end = App.state.ovCustomEnd || today;
      break;
    default:
      start = today; end = today;
  }
  return { start, end };
}

function filterByPeriod(items, dateField, range) {
  if (!items || !items.length) return [];
  return items.filter(item => {
    const d = item[dateField];
    if (!d) return false;
    return d >= range.start && d <= range.end;
  });
}

function renderPeriodSelector(containerId, onChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const current = App.state.period || 'month';
  const periods = [
    { key: 'today', label: 'Hoje' },
    { key: 'week', label: 'Semana' },
    { key: 'month', label: 'Mês' },
    { key: 'lastMonth', label: 'Mês Passado' },
    { key: 'custom', label: 'Personalizado' },
  ];
  const range = getDateRange(current);
  container.innerHTML = `
    <div class="period-selector">
      ${periods.map(p => `<button class="period-btn ${current === p.key ? 'active' : ''}" data-period="${p.key}">${p.label}</button>`).join('')}
      <div class="period-custom${current === 'custom' ? ' show' : ''}" id="period-custom-range">
        <input type="date" id="period-start" value="${App.state.periodCustomStart || ''}" placeholder="Início">
        <span> até </span>
        <input type="date" id="period-end" value="${App.state.periodCustomEnd || ''}" placeholder="Fim">
      </div>
      <span class="period-range-label" id="period-range-label">📅 ${range.start === range.end ? formatDate(range.start) : formatDate(range.start) + ' a ' + formatDate(range.end)}</span>
    </div>
  `;

  container.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const period = btn.dataset.period;
      App.state.period = period;
      if (period !== 'custom') { App.state.periodCustomStart = ''; App.state.periodCustomEnd = ''; }
      renderPeriodSelector(containerId, onChange);
      if (onChange) onChange(getDateRange(period));
    });
  });

  const startInput = document.getElementById('period-start');
  const endInput = document.getElementById('period-end');
  if (startInput && endInput) {
    const applyCustom = () => {
      App.state.periodCustomStart = startInput.value;
      App.state.periodCustomEnd = endInput.value;
      if (startInput.value && endInput.value) {
        document.getElementById('period-range-label').textContent = `📅 ${formatDate(startInput.value)} a ${formatDate(endInput.value)}`;
        if (onChange) onChange(getDateRange('custom'));
      }
    };
    startInput.addEventListener('change', applyCustom);
    endInput.addEventListener('change', applyCustom);
  }
}

/* ============================================
   TOAST NOTIFICATIONS
   ============================================ */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.innerHTML = message;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(40px)'; toast.style.transition = '.3s ease'; }, 3000);
  setTimeout(() => toast.remove(), 3500);
}

function showNotificationPopup(message, type = 'info') {
  const existing = document.getElementById('notif-popup');
  if (existing) existing.remove();

  const popup = document.createElement('div');
  popup.id = 'notif-popup';
  popup.style.cssText = `
    position:fixed;bottom:1.5rem;right:1.5rem;z-index:10000;
    background:var(--bg-card);border:1px solid var(--border-color);
    border-radius:12px;padding:1rem 1.25rem;max-width:380px;
    box-shadow:0 8px 32px rgba(0,0,0,.5);
    animation:slideUp .3s ease;
    font-size:.88rem;color:var(--text-primary);
    display:flex;align-items:flex-start;gap:.75rem
  `;
  const iconMap = { task: '✅', meeting: '📅', warning: '⚠️', info: 'ℹ️' };
  popup.innerHTML = `<span style="font-size:1.2rem;flex-shrink:0">${iconMap[type] || ''}</span>
    <div style="flex:1">${message}</div>
    <button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.1rem;line-height:1;padding:0 0 0 .5rem">&times;</button>`;
  document.body.appendChild(popup);
  setTimeout(() => { popup.style.opacity = '0'; popup.style.transform = 'translateY(20px)'; popup.style.transition = '.3s ease'; }, 5000);
  setTimeout(() => popup.remove(), 5500);
}

/* ============================================
   MODAL SYSTEM
   ============================================ */
function openModal(title, bodyHTML, options = {}) {
  const overlay = document.getElementById('modal-overlay');
  const container = document.getElementById('modal-container');
  const titleEl = document.getElementById('modal-title');
  const bodyEl = document.getElementById('modal-body');

  titleEl.textContent = title;
  bodyEl.innerHTML = bodyHTML;

  if (options.large) container.classList.add('large');
  else container.classList.remove('large');

  container.style.maxWidth = options.maxWidth || '';
  overlay.style.display = 'flex';

  return {
    close: () => { overlay.style.display = 'none'; },
    setBody: (html) => { bodyEl.innerHTML = html; },
  };
}

function showModal(title, html) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-overlay').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  document.getElementById('modal-container').classList.remove('large');
}

/* ============================================
   NAVIGATION
   ============================================ */
function navigateToTasks(filters = {}) {
  if (filters.employeeId) {
    document.getElementById('filter-task-employee').value = filters.employeeId;
  } else {
    document.getElementById('filter-task-employee').value = 'all';
  }
  if (filters.status) {
    document.getElementById('filter-task-status').value = filters.status;
  } else {
    document.getElementById('filter-task-status').value = 'all';
  }
  if (filters.search) {
    document.getElementById('filter-task-search').value = filters.search;
  } else {
    document.getElementById('filter-task-search').value = '';
  }
  if (filters.dateStart) {
    document.getElementById('filter-task-date-start').value = filters.dateStart;
  }
  if (filters.dateEnd) {
    document.getElementById('filter-task-date-end').value = filters.dateEnd;
  }
  navigateTo('tasks');
}

function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const target = document.getElementById('page-' + page);
  if (target) target.classList.add('active');

  const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navItem) navItem.classList.add('active');

  App.state.currentPage = page;

  const titles = {
    dashboard: 'Painel', agenda: 'Agenda', tasks: 'Tarefas', team: 'Equipe',
    meetings: 'Reuniões', reports: 'Relatórios', operations: 'Centro de Controle',
    goals: 'Metas e KPIs', docs: 'Documentos', map: 'Mapa Operacional',
    automation: 'Automações', 'notifications-page': 'Notificações',
    settings: 'Configurações',
  };
  document.getElementById('page-title').textContent = titles[page] || page;

  renderPage(page);
}

function renderPage(page) {
  switch (page) {
    case 'dashboard':
      renderPeriodSelector('dashboard-period-selector', onDashboardPeriodChange);
      renderDashboard();
      break;
    case 'agenda': renderAgenda(); break;
    case 'tasks': renderTasks(); break;
    case 'team': renderTeam(); break;
    case 'meetings':
      renderMeetings(); break;
    case 'reports':
      renderPeriodSelector('reports-period-selector', onReportsPeriodChange);
      renderReports();
      break;
    case 'notifications-page': renderNotificationsPage(); break;
    case 'map':
      renderMapOverview();
      initMapTabEvents();
      initMapDateNav();
      App.state.mapDate = getDateRange(App.state.mapOverviewPeriod || 'today').end;
      renderMap();
      break;
    case 'goals': renderGoals(); break;
    case 'docs': renderDocs(); break;
    case 'automation': renderAutomation(); break;
    case 'operations': renderOperations(); break;
    case 'settings':
      renderSettings();
      break;
  }
}

/* ============================================
   LOGIN
   ============================================ */

function toggleLoginForm(showSignup) {
  document.getElementById('login-form-enter').style.display = showSignup ? 'none' : 'block';
  document.getElementById('login-form-signup').style.display = showSignup ? 'block' : 'none';
  document.getElementById('login-error').style.display = 'none';
  document.getElementById('signup-error').style.display = 'none';
}

async function doSignup() {
  const companyName = document.getElementById('signup-company').value.trim();
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value.trim();
  const errEl = document.getElementById('signup-error');

  if (!companyName || !name || !email || !password) {
    errEl.textContent = 'Preencha todos os campos.';
    errEl.style.display = 'block'; return;
  }
  if (password.length < 4) {
    errEl.textContent = 'Senha deve ter no mínimo 4 caracteres.';
    errEl.style.display = 'block'; return;
  }

  errEl.textContent = 'Criando conta...';
  errEl.style.display = 'block';

  const { company, error: cErr } = await db.createCompany(companyName);
  if (cErr || !company) {
    errEl.textContent = 'Erro ao criar empresa: ' + (cErr || 'desconhecido');
    errEl.style.display = 'block'; return;
  }

  const result = await db.signup(email, password, name, company.id, 'gestor');
  if (result.error) {
    errEl.textContent = 'Erro: ' + result.error;
    errEl.style.display = 'block'; return;
  }

  const loggedIn = await db.login(email, password);
  if (loggedIn) {
    App.state.user = loggedIn;
    afterLogin();
    return;
  }

  errEl.textContent = 'Conta criada! Faça login.';
  errEl.style.color = 'var(--green)';
  document.getElementById('login-email').value = email;
  setTimeout(() => toggleLoginForm(false), 2000);
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value.trim();
  const errEl = document.getElementById('login-error');

  if (!email || !password) {
    errEl.textContent = 'Preencha email e senha.';
    errEl.style.display = 'block';
    return;
  }

  const user = await db.login(email, password);
  if (!user) {
    errEl.textContent = 'Email ou senha inválidos.';
    errEl.style.display = 'block';
    return;
  }

  errEl.style.display = 'none';
  App.state.user = user;
  afterLogin();
}

async function checkExistingSession() {
  const user = await db.getSession();
  if (user) {
    App.state.user = user;
    afterLogin();
    return true;
  }
  return false;
}

async function ensureEmployeeRecord() {
  try {
    const u = App.state.user;
    if (!u || !u.company_id) return;
    await sb.from('employees').upsert({
      id: u.id,
      company_id: u.company_id,
      name: u.name,
      role: u.type === 'gestor' ? 'Gestor' : 'Funcionário',
      status: 'free',
    }, { onConflict: 'id' });
  } catch (e) { console.warn('ensureEmployeeRecord:', e); }
}

function afterLogin() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';

  const isAdmin = hasRole('supervisor');
  document.getElementById('btn-new-task').style.display = isAdmin ? 'inline-flex' : 'none';
  document.getElementById('btn-new-employee').style.display = isAdmin ? 'inline-flex' : 'none';
  document.getElementById('btn-new-meeting').style.display = isAdmin ? 'inline-flex' : 'none';

  if (App.state.user.type === 'funcionario') {
    document.getElementById('page-team').classList.add('funcionario-view');
    document.getElementById('page-tasks').classList.add('funcionario-view');
  } else {
    document.getElementById('page-team').classList.remove('funcionario-view');
    document.getElementById('page-tasks').classList.remove('funcionario-view');
  }

  // Nav visibility based on role
  const canConfig = hasRole('gerente');
  document.getElementById('nav-settings').style.display = canConfig ? '' : 'none';
  document.getElementById('nav-goals').style.display = isAdmin ? '' : 'none';
  document.getElementById('nav-docs').style.display = canConfig ? '' : 'none';
  document.getElementById('nav-automation').style.display = canConfig ? '' : 'none';

  updateUserUI();
  navigateTo('dashboard');
  updateNotificationsBadge();

  // Ensure user has an employee record (auto-create if missing)
  ensureEmployeeRecord();

  // Request notification permission for browser popups
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // Generate recurring task instances
  generateRecurringTasks();

  // Show onboarding wizard for new companies
  checkOnboarding();

  // Start real-time subscriptions
  setupRealtime();
}

function updateUserUI() {
  const u = App.state.user;
  if (!u) return;
  const initial = u.initials || u.name[0];
  document.getElementById('sidebar-avatar').textContent = initial;
  document.getElementById('sidebar-name').textContent = u.name;
  document.getElementById('sidebar-role').textContent = getRoleLabel(u.type);
  document.getElementById('topbar-avatar').textContent = initial;
  document.getElementById('topbar-name').textContent = u.name;
  document.getElementById('topbar-role').textContent = getRoleLabel(u.type);
}

async function doLogout() {
  App.state.user = null;
  _cache = { employees: null, tasks: null, meetings: null, participants: null, notifications: null, allocations: null, sectors: null, recurrenceOptions: null };
  cleanupRealtime();
  await db.logout();
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-password').value = '';
  updateNotificationsBadge();
}

/* ============================================
   NOTIFICATIONS
   ============================================ */
async function addNotification(message, type = 'task', relatedId = null) {
  const notif = {
    type,
    message,
    read: false,
    related_id: relatedId,
    created_at: nowBrasilISO(),
  };
  await db.insertNotification(notif);
  invalidateCache('notifications');
  updateNotificationsBadge();
}

async function updateNotificationsBadge() {
  const notifs = await getCachedNotifications();
  const unread = notifs.filter(n => !n.read).length;
  document.getElementById('notif-badge').textContent = unread;
  document.getElementById('notif-nav-badge').textContent = unread;
  document.getElementById('notif-badge').style.display = unread > 0 ? 'inline' : 'none';
  document.getElementById('notif-nav-badge').style.display = unread > 0 ? 'inline' : 'none';
}

async function auditLog(action, entityType, entityId, description, beforeData, afterData) {
  try {
    await db.insertAuditLog({
      user_id: App.state.user?.id,
      action, entity_type: entityType, entity_id: entityId,
      description, before_data: beforeData || null, after_data: afterData || null,
    });
  } catch (e) {}
}

async function renderNotifDropdown() {
  const list = document.getElementById('notif-list');
  const notifs = await getCachedNotifications();
  if (notifs.length === 0) {
    list.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--text-muted);font-size:.85rem">Nenhuma notificação</div>';
    return;
  }
  list.innerHTML = notifs.slice(0, 10).map(n => `
    <div class="notif-item ${n.read ? '' : 'unread'}" data-id="${n.id}">
      <div class="notif-icon">
        ${n.type === 'task' ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>' :
        n.type === 'meeting' ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' :
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'}
      </div>
      <div>
        <div class="notif-text">${n.message}</div>
        <div class="notif-time">${formatDateTime(n.created_at)}</div>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.notif-item').forEach(el => {
    el.addEventListener('click', async () => {
      const id = parseInt(el.dataset.id);
      await markNotifRead(id);
      renderNotifDropdown();
      updateNotificationsBadge();
    });
  });
}

async function markNotifRead(id) {
  await db.markNotificationRead(id);
  invalidateCache('notifications');
}

async function markAllNotifsRead() {
  await db.markAllNotificationsRead();
  invalidateCache('notifications');
  renderNotifDropdown();
  updateNotificationsBadge();
}

async function renderNotificationsPage() {
  const list = document.getElementById('notif-page-list');
  const notifs = await getCachedNotifications();
  if (notifs.length === 0) {
    list.innerHTML = '<div class="card"><div class="card-body" style="text-align:center;color:var(--text-muted)">Nenhuma notificação</div></div>';
    return;
  }
  list.innerHTML = notifs.map(n => `
    <div class="card" style="${n.read ? '' : 'border-left: 3px solid var(--blue);'}">
      <div class="card-body" style="display:flex;align-items:flex-start;gap:.75rem;padding:.85rem 1.25rem;">
        <div style="flex-shrink:0;margin-top:2px">${n.type === 'task' ? '✅' : n.type === 'meeting' ? '📅' : '⚠️'}</div>
        <div style="flex:1">
          <div style="font-size:.9rem">${n.message}</div>
          <div style="font-size:.78rem;color:var(--text-muted);margin-top:4px">${formatDateTime(n.created_at)}</div>
        </div>
        <button class="btn btn-sm btn-secondary" onclick="markNotifRead(${n.id});renderNotificationsPage();updateNotificationsBadge();" style="${n.read ? 'display:none' : ''}">Marcar lida</button>
      </div>
    </div>
  `).join('');
}

/* ============================================
   DASHBOARD
   ============================================ */
async function renderDashboard() {
  const range = getDateRange(App.state.period || 'month');
  const [allTasks, employees] = await Promise.all([getCachedTasks(), getCachedEmployees()]);
  const periodTasks = filterByPeriod(allTasks, 'date', range);
  const today = todayBrasil();

  const completed = periodTasks.filter(t => t.status === 'completed').length;
  const pending = periodTasks.filter(t => t.status === 'pending').length;
  const inProgress = periodTasks.filter(t => t.status === 'in_progress').length;
  const overdue = periodTasks.filter(t => t.status !== 'completed' && t.date < today).length;
  const activeEmployees = employees.filter(e => e.status !== 'free').length;

  document.getElementById('metrics-grid').innerHTML = `
    <div class="metric-card">
      <div class="metric-icon green"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg></div>
      <div class="metric-info"><div class="metric-value">${completed}</div><div class="metric-label">Concluídas no Período</div></div>
    </div>
    <div class="metric-card">
      <div class="metric-icon amber"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/></svg></div>
      <div class="metric-info"><div class="metric-value">${pending + inProgress}</div><div class="metric-label">Pendentes / Em Andamento</div></div>
    </div>
    <div class="metric-card">
      <div class="metric-icon red"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
      <div class="metric-info"><div class="metric-value">${overdue}</div><div class="metric-label">Atrasadas</div></div>
    </div>
    <div class="metric-card">
      <div class="metric-icon blue"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6"/><path d="M23 11h-6"/></svg></div>
      <div class="metric-info"><div class="metric-value">${activeEmployees}</div><div class="metric-label">Funcionários em Atividade</div></div>
    </div>
  `;

  // Alerts
  const alerts = document.getElementById('alerts-list');
  const allOverdue = allTasks.filter(t => t.status !== 'completed' && t.date < today);
  if (allOverdue.length > 0) {
    alerts.innerHTML = allOverdue.length + ' tarefa(s) atrasada(s) precisam de atenção.' +
      allOverdue.slice(0, 5).map(t =>
        `<div class="alert-item" onclick="showTaskDetail(${t.id})" style="cursor:pointer"><span class="alert-dot red"></span><span><strong>${t.title}</strong> - ${getEmployeeName(t.assignee, employees)} (venceu ${formatDate(t.date)})</span></div>`
      ).join('');
  } else {
    alerts.innerHTML = '<div style="color:var(--text-muted);font-size:.85rem">Nenhum alerta no momento</div>';
  }

  // Activities
  const activities = document.getElementById('activities-list');
  const recentTasks = [...allTasks].sort((a, b) => {
    const ta = a.evidence_timestamp || a.created_at;
    const tb = b.evidence_timestamp || b.created_at;
    return tb.localeCompare(ta);
  }).slice(0, 5);

  activities.innerHTML = recentTasks.map(t => {
    const emp = employees.find(e => e.id === t.assignee);
    const color = emp ? randomColor(emp.name) : '#666';
    const initials = emp ? getInitials(emp.name) : '??';
    return `<div class="activity-item" onclick="showTaskDetail(${t.id})" style="cursor:pointer">
      <div class="activity-avatar" style="background:${color}">${initials}</div>
      <div><strong>${t.title}</strong> - ${statusLabel(t.status)}<br><span style="font-size:.78rem;color:var(--text-muted)">${emp ? emp.name : ''} • ${formatDateTime(t.evidence_timestamp || t.created_at)}</span></div>
    </div>`;
  }).join('');

  drawProductivityChart(allTasks, employees);
  drawTasksStatusChart(allTasks);
}

function onDashboardPeriodChange(range) { renderDashboard(); }
function onReportsPeriodChange(range) { renderReports(); }

function drawProductivityChart(allTasks, employees) {
  const canvas = document.getElementById('chart-productivity');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width - 24 || 500;
  canvas.height = 220;

  const w = canvas.width, h = canvas.height;
  const pad = { top: 30, bottom: 40, left: 40, right: 20 };

  ctx.clearRect(0, 0, w, h);


  const data = employees.map(emp => {
    const total = allTasks.filter(t => t.assignee === emp.id).length;
    const done = allTasks.filter(t => t.assignee === emp.id && t.status === 'completed').length;
    return { name: emp.name.split(' ')[0], total, done, rate: total > 0 ? (done / total * 100) : 0 };
  }).slice(0, 6);

  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;
  const barW = Math.min(chartW / data.length / 2.5, 30);
  const gap = (chartW - barW * 2 * data.length) / (data.length + 1);
  const maxVal = Math.max(...data.map(d => d.total || 1), 1);

  data.forEach((d, i) => {
    const x = pad.left + gap + i * (barW * 2 + gap);
    const totalH = (d.total / maxVal) * chartH;
    const doneH = (d.done / maxVal) * chartH;
    ctx.fillStyle = '#3a3a6a';
    ctx.fillRect(x, pad.top + chartH - totalH, barW, totalH);
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(x + barW, pad.top + chartH - doneH, barW, doneH);
    ctx.fillStyle = '#9494b8';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(d.name, x + barW, h - pad.bottom + 16);
    ctx.fillText(Math.round(d.rate) + '%', x + barW, pad.top + chartH - Math.max(totalH, doneH) - 6);
  });

  ctx.fillStyle = '#3a3a6a';
  ctx.fillRect(w - 150, 8, 10, 10);
  ctx.fillStyle = '#9494b8';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Total', w - 135, 18);
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(w - 80, 8, 10, 10);
  ctx.fillStyle = '#9494b8';
  ctx.fillText('Concluídas', w - 65, 18);
}

function drawTasksStatusChart(allTasks) {
  const canvas = document.getElementById('chart-tasks-status');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width - 24 || 500;
  canvas.height = 220;

  const w = canvas.width, h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  const statuses = [
    { key: 'pending', label: 'Pendente', color: '#f59e0b', count: allTasks.filter(t => t.status === 'pending').length },
    { key: 'in_progress', label: 'Em Andamento', color: '#3b82f6', count: allTasks.filter(t => t.status === 'in_progress').length },
    { key: 'completed', label: 'Concluído', color: '#10b981', count: allTasks.filter(t => t.status === 'completed').length },
  ];
  const total = statuses.reduce((s, st) => s + st.count, 0) || 1;

  const cx = w / 2, cy = h / 2 - 10, radius = Math.min(w, h) / 2 - 50;
  let startAngle = -Math.PI / 2;

  const slices = statuses.map(st => ({ ...st, angle: (st.count / total) * 2 * Math.PI }));

  slices.forEach(s => {
    if (s.count === 0) return;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startAngle, startAngle + s.angle);
    ctx.closePath();
    ctx.fillStyle = s.color;
    ctx.fill();
    const mid = startAngle + s.angle / 2;
    const lx = cx + (radius * 0.65) * Math.cos(mid);
    const ly = cy + (radius * 0.65) * Math.sin(mid);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    if (s.count > 0) ctx.fillText(s.count, lx, ly + 4);
    startAngle += s.angle;
  });

  let ly = h - 30;
  ctx.textAlign = 'left';
  const legendX = w / 2 - slices.length * 60;
  slices.forEach((s, i) => {
    const x = legendX + i * 120;
    ctx.fillStyle = s.color;
    ctx.fillRect(x, ly - 6, 10, 10);
    ctx.fillStyle = '#9494b8';
    ctx.font = '11px sans-serif';
    ctx.fillText(s.label + ' (' + s.count + ')', x + 14, ly + 3);
  });
}

/* ============================================
   AGENDA
   ============================================ */
function getWeekDays(offset) {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() + offset * 7);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

function formatWeekDay(d) {
  const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  return weekdays[d.getDay()];
}

function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}

async function renderAgenda() {
  const container = document.getElementById('agenda-content');
  const offset = App.state.agendaWeekOffset || 0;
  const days = getWeekDays(offset);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekStart = days[0];
  const weekEnd = days[6];
  const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const label = weekStart.getMonth() === weekEnd.getMonth()
    ? `${weekStart.getDate()} a ${weekEnd.getDate()} de ${monthNames[weekStart.getMonth()]}`
    : `${weekStart.getDate()} de ${monthNames[weekStart.getMonth()]} a ${weekEnd.getDate()} de ${monthNames[weekEnd.getMonth()]}`;
  document.getElementById('agenda-week-label').textContent = label;

  const [tasks, meetings, employees, participants, allAllocs, schedules] = await Promise.all([
    getCachedTasks(), getCachedMeetings(), getCachedEmployees(), getCachedParticipants(), getCachedAllocations(), getCachedSchedules()
  ]);

  let filteredTasks = tasks;
  let filteredMeetings = meetings;

  if (isFuncionario()) {
    filteredTasks = tasks.filter(t => t.assignee === currentUserId());
    filteredMeetings = meetings.filter(m => participants.some(p => p.meeting_id === m.id && p.employee_id === currentUserId()));
  }

  // Pre-compute allocation state for each day in the week
  const dayAllocMap = {};
  const hasAnyAlloc = allAllocs && allAllocs.some(a => a.area !== null);
  days.forEach(day => {
    const ds = day.toISOString().slice(0, 10);
    dayAllocMap[ds] = hasAnyAlloc ? new Set(getAllocationsAtDate(allAllocs, ds).map(a => a.employee_id)) : null;
  });

  // Collect recurring tasks that should appear
  const recurringTasks = filteredTasks.filter(t => t.recurrence !== 'none');

  let allEmpty = true;
  let html = '<div class="agenda-grid">';

  days.forEach((day, idx) => {
    const dateStr = day.toISOString().slice(0, 10);
    const isToday = isSameDay(day, today);
    const isPast = day < today;

    let dayTasks = filteredTasks.filter(t => t.date === dateStr && isWorkingDay(schedules, t.assignee, dateStr));
    const dayMeetings = filteredMeetings.filter(m => m.date === dateStr);

    // Add recurring tasks — skip if employee is off/vacation on this day
    recurringTasks.forEach(t => {
      if (t.date === dateStr) return;
      if (!isWorkingDay(schedules, t.assignee, dateStr)) return;
      const taskDay = new Date(t.date + 'T12:00:00');
      if (t.recurrence === 'daily') {
        dayTasks.push({ ...t, _recurring: true });
      } else if (t.recurrence === 'weekly' && taskDay.getDay() === day.getDay()) {
        dayTasks.push({ ...t, _recurring: true });
      }
    });

    if (dayTasks.length > 0 || dayMeetings.length > 0) allEmpty = false;

    html += `<div class="agenda-day ${isToday ? 'today' : ''} ${isPast ? 'past' : ''}">
      <div class="agenda-day-header">
        <span class="agenda-day-name">${formatWeekDay(day)}</span>
        <span class="agenda-day-num">${day.getDate()}</span>
      </div>
      <div class="agenda-day-items">`;

    dayMeetings.forEach(m => {
      const mp = participants.filter(p => p.meeting_id === m.id);
      const confirmed = mp.filter(p => p.status === 'confirmed').length;
      const total = mp.length;
      html += `<div class="agenda-item meeting" onclick="navigateTo('meetings')">
        <div class="agenda-item-time">${formatTime(m.time)}</div>
        <div class="agenda-item-content">
          <div class="agenda-item-title">📅 ${m.title}</div>
          <div class="agenda-item-meta">${m.duration}min • ${confirmed}/${total} confirmados</div>
        </div>
      </div>`;
    });

    dayTasks.forEach(t => {
      const emp = employees.find(e => e.id === t.assignee);
      const statusColors = { pending: 'var(--amber)', in_progress: 'var(--blue)', completed: 'var(--green)' };
      const empStatus = !isWorkingDay(schedules, t.assignee, dateStr) ? ' 🏖️' : '';
      html += `<div class="agenda-item task status-${t.status}" onclick="navigateTo('tasks')">
        <div class="agenda-item-time">${formatTime(t.time)}</div>
        <div class="agenda-item-content">
          <div class="agenda-item-title">
            <span class="agenda-status-dot" style="background:${statusColors[t.status] || 'var(--amber)'}"></span>
            ${t.title}
          </div>
          <div class="agenda-item-meta">👤 ${emp ? emp.name : '—'} • ${statusLabel(t.status)}${t.requires_evidence ? ' • 📸' : ''}${t._recurring ? ' • 🔄' : ''}${empStatus}</div>
        </div>
      </div>`;
    });

    if (dayTasks.length === 0 && dayMeetings.length === 0) {
      html += `<div class="agenda-empty">Nenhum item</div>`;
    }

    html += `</div></div>`;
  });

  html += '</div>';

  if (allEmpty && offset === 0) {
    html += '<div class="card" style="margin-top:1rem"><div class="card-body" style="text-align:center;color:var(--text-muted);padding:2rem">Nenhuma tarefa ou reunião agendada para esta semana.</div></div>';
  }

  container.innerHTML = html;
}

/* ============================================
   TEAM
   ============================================ */
async function renderTeam() {
  const grid = document.getElementById('team-grid');
  const employees = await getCachedEmployees();
  const schedules = await getCachedSchedules();
  const allocations = await getCachedAllocations();
  const today = todayBrasil();

  if (!employees.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--text-muted)">Nenhum funcionário cadastrado ainda. <br><small>Use "Adicionar" para criar um.</small></div>`;
    return;
  }

  const todayAllocs = allocations.filter(a => (a.allocated_at || '').startsWith(today));

  grid.innerHTML = employees.map(emp => {
    const onVacation = schedules.some(s => s.employee_id === emp.id && s.start_date <= today && s.end_date >= today && s.type === 'vacation');
    const areaAlloc = todayAllocs.find(a => a.employee_id === emp.id);
    return `
    <div class="employee-card" onclick="showEmployeeCard(${emp.id})">
      <div class="emp-avatar" style="background:${randomColor(emp.name)}">${getInitials(emp.name)}</div>
      <div class="emp-name">${emp.name}</div>
      <div class="emp-role">${emp.role}</div>
      ${areaAlloc ? `<div style="font-size:.72rem;color:var(--text-muted);margin-top:2px">📍 ${areaAlloc.area}</div>` : ''}
    </div>
  `}).join('');
}

async function showEmployeeCard(empId) {
  const employees = await getCachedEmployees();
  const emp = employees.find(e => e.id === empId);
  if (!emp) return;
  const [tasks, feedbacks, docs] = await Promise.all([
    getCachedTasks(),
    db.getFeedbacks(empId).catch(() => []),
    db.getEmployeeDocs(empId).catch(() => []),
  ]);
  const today = todayBrasil();
  const empTasks = tasks.filter(t => t.assignee === empId);
  const completed = empTasks.filter(t => t.status === 'completed');
  const completionRate = empTasks.length ? Math.round(completed.length / empTasks.length * 100) : 0;

  const badgeClass = emp.status === 'free' ? 'free' : emp.status === 'busy' ? 'busy' : 'working';
  const badgeLabel = emp.status === 'free' ? 'Livre' : emp.status === 'busy' ? 'Ocupado' : 'Em Tarefa';

  openModal(emp.name, `
    <div class="emp-dossier-tabs">
      <button class="emp-dossier-tab active" onclick="switchDossierTab(this,'dados')">📋 Dados</button>
      <button class="emp-dossier-tab" onclick="switchDossierTab(this,'historico')">📊 Histórico</button>
      <button class="emp-dossier-tab" onclick="switchDossierTab(this,'feedbacks')">💬 Feedbacks</button>
      <button class="emp-dossier-tab" onclick="switchDossierTab(this,'docs')">📄 Documentos</button>
    </div>
    <div id="dossier-dados" class="dossier-section">
      <div class="dossier-header">
        <div class="dossier-avatar" style="background:${randomColor(emp.name)}">${getInitials(emp.name)}</div>
        <div class="dossier-info">
          <div class="dossier-name">${emp.name}</div>
          <div class="dossier-role">${emp.role}</div>
          <div class="dossier-badge ${badgeClass}">${badgeLabel}</div>
        </div>
      </div>
      <div class="dossier-stats">
        <div class="dossier-stat"><span class="ds-val">${completionRate}%</span><span class="ds-lbl">Conclusão</span></div>
        <div class="dossier-stat"><span class="ds-val">${empTasks.length}</span><span class="ds-lbl">Tarefas</span></div>
        <div class="dossier-stat"><span class="ds-val">${completed.length}</span><span class="ds-lbl">Concluídas</span></div>
      </div>
      ${isGestor() ? `
      <div class="dossier-actions">
        <button class="btn btn-sm btn-primary" onclick="closeModal();createEmployeeLogin(${emp.id})">🔑 Criar Login</button>
        <button class="btn btn-sm btn-outline" onclick="closeModal();showEmployeeTasks(${emp.id})">📋 Tarefas</button>
        <button class="btn btn-sm btn-outline" onclick="closeModal();editEmployee(${emp.id})">✏️ Editar</button>
        <button class="btn btn-sm btn-outline-danger" onclick="closeModal();deleteEmployee(${emp.id})">🗑️ Remover</button>
      </div>` : ''}
    </div>
    <div id="dossier-historico" class="dossier-section" style="display:none">
      <div class="dossier-section-title">Últimas tarefas</div>
      <div class="dossier-tasks-list">
        ${empTasks.length ? empTasks.slice(0, 15).map(t => `<div class="dossier-task-item" onclick="closeModal();showTaskDetail(${t.id})"><span class="dti-icon">${t.status === 'completed' ? '✅' : t.date < today ? '🔴' : '⏳'}</span><span class="dti-title">${t.title}</span><span class="dti-date">${formatDate(t.date)}</span></div>`).join('') : '<div class="dossier-empty">Nenhuma tarefa encontrada</div>'}
      </div>
    </div>
    <div id="dossier-feedbacks" class="dossier-section" style="display:none">
      ${isGestor() ? `<button class="btn btn-sm btn-primary" onclick="addFeedback(${emp.id})" style="margin-bottom:.5rem">➕ Adicionar Feedback</button>` : ''}
      <div class="dossier-feedback-list">
        ${feedbacks.length ? feedbacks.map(f => `<div class="ops-feedback-item"><div class="fb-header"><span class="fb-rating">${'★'.repeat(f.rating)}${'☆'.repeat(5-(f.rating||0))}</span><span class="fb-date">${new Date(f.created_at).toLocaleDateString('pt-BR')}</span></div><div class="fb-text">${f.text}</div></div>`).join('') : '<div class="dossier-empty">Nenhum feedback ainda</div>'}
      </div>
    </div>
    <div id="dossier-docs" class="dossier-section" style="display:none">
      ${isGestor() ? `<button class="btn btn-sm btn-primary" onclick="addEmployeeDoc(${emp.id})" style="margin-bottom:.5rem">➕ Adicionar Documento</button>` : ''}
      <div class="dossier-doc-list">
        ${docs.length ? docs.map(d => `<div class="ops-doc-row"><span class="doc-name">📄 ${d.name}</span><button class="btn btn-sm btn-ghost" onclick="deleteEmployeeDoc('${d.id}')">🗑️</button></div>`).join('') : '<div class="dossier-empty">Nenhum documento</div>'}
      </div>
    </div>
  `, { large: true, maxWidth: '600px' });
}

function switchDossierTab(btn, tab) {
  document.querySelectorAll('.emp-dossier-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.dossier-section').forEach(s => s.style.display = 'none');
  document.getElementById('dossier-' + tab).style.display = 'block';
}

async function addFeedback(empId) {
  const text = prompt('Escreva o feedback:');
  if (!text) return;
  const rating = prompt('Nota (1-5):');
  if (!rating || rating < 1 || rating > 5) { showToast('Nota deve ser entre 1 e 5', 'error'); return; }
  await db.insertFeedback({ employee_id: empId, author_id: App.state.user.id, text, rating: parseInt(rating) });
  showToast('Feedback adicionado!', 'success');
  showEmployeeCard(empId);
}

async function addEmployeeDoc(empId) {
  const name = prompt('Nome do documento:');
  if (!name) return;
  const url = prompt('URL do arquivo:');
  if (!url) return;
  await db.insertEmployeeDoc({ employee_id: empId, name, file_url: url });
  showToast('Documento adicionado!', 'success');
  showEmployeeCard(empId);
}

async function deleteEmployeeDoc(id) {
  if (!confirm('Remover documento?')) return;
  await db.deleteEmployeeDoc(id);
  showToast('Documento removido.', 'info');
  // Re-show current employee card
}

function showNewEmployeeModal() {
  if (isFuncionario()) { showToast('Apenas gestores podem gerenciar equipe', 'error'); return; }
  openModal('Novo Funcionário', `
    <div class="form-group"><label>Nome</label><input type="text" id="emp-name" placeholder="Nome completo"></div>
    <div class="form-group"><label>Cargo</label><input type="text" id="emp-role" placeholder="Cargo/função"></div>
    <div class="form-group"><label>Nível de Acesso</label>
      <select id="emp-type">
        <option value="funcionario">Funcionário</option>
        <option value="supervisor">Supervisor</option>
        <option value="gerente">Gerente</option>
        <option value="auditor">Auditor</option>
      </select>
    </div>
    <div class="form-group"><label>Status</label>
      <select id="emp-status">
        <option value="free">Livre</option>
        <option value="busy">Ocupado</option>
        <option value="task">Em Tarefa</option>
      </select>
    </div>
    <div class="form-row">
      <button class="btn btn-primary" onclick="saveNewEmployee()">Salvar</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    </div>
  `);
}

async function saveNewEmployee() {
  const name = document.getElementById('emp-name').value.trim();
  const role = document.getElementById('emp-role').value.trim();
  const status = document.getElementById('emp-status').value;
  if (!name || !role) { showToast('Preencha nome e cargo', 'error'); return; }

  await db.insertEmployee({ id: uid(), name, role, status });
  invalidateCache('employees');
  closeModal();
  renderTeam();
  showToast('Funcionário cadastrado com sucesso!', 'success');
}

async function editEmployee(id) {
  const emp = await db.getEmployee(id);
  if (!emp) return;
  let schedules = [];
  try { schedules = await getCachedSchedules(); } catch (e) {}
  const empSchedules = schedules.filter(s => s.employee_id === id).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const scheduleHtml = empSchedules.length > 0
    ? empSchedules.map(s => `<div style="display:flex;align-items:center;gap:.5rem;padding:3px 0;font-size:.8rem">
        <span style="color:${s.type === 'working' ? 'var(--green)' : 'var(--red)'}">${s.type === 'working' ? '✅' : s.type === 'day_off' ? '🚫' : '🏖️'}</span>
        <span>${formatDate(s.start_date)}${s.start_date !== s.end_date ? ' a ' + formatDate(s.end_date) : ''}</span>
        <span style="color:var(--text-muted)">${s.type === 'working' ? 'Trabalho' : s.type === 'day_off' ? 'Folga' : 'Férias'}</span>
        <button class="btn btn-sm btn-danger" onclick="deleteSchedule(${s.id})" style="padding:2px 6px;font-size:.7rem">&times;</button>
      </div>`).join('')
    : '<div style="font-size:.8rem;color:var(--text-muted)">Nenhum registro de escala.</div>';

  openModal('Editar Funcionário: ' + emp.name, `
    <div class="form-group"><label>Nome</label><input type="text" id="emp-name-edit" value="${emp.name}"></div>
    <div class="form-group"><label>Cargo</label><input type="text" id="emp-role-edit" value="${emp.role}"></div>
    <div class="form-group"><label>Status</label>
      <select id="emp-status-edit">
        <option value="free" ${emp.status === 'free' ? 'selected' : ''}>Livre</option>
        <option value="busy" ${emp.status === 'busy' ? 'selected' : ''}>Ocupado</option>
        <option value="task" ${emp.status === 'task' ? 'selected' : ''}>Em Tarefa</option>
      </select>
    </div>
    <hr style="border-color:var(--border-color);margin:.75rem 0">
    <h4 style="font-size:.85rem;margin:0 0 .5rem 0;color:var(--text-secondary)">Gerenciar Escala (${emp.name})</h4>
    <div style="margin-bottom:.75rem">
      <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
        <input type="date" id="schedule-start" style="flex:1;min-width:100px">
        <span style="color:var(--text-muted)">até</span>
        <input type="date" id="schedule-end" style="flex:1;min-width:100px">
        <select id="schedule-type" style="flex:1;min-width:90px">
          <option value="working">Trabalho</option>
          <option value="day_off">Folga</option>
          <option value="vacation">Férias</option>
        </select>
        <button class="btn btn-sm btn-primary" onclick="addSchedule(${id})">Adicionar</button>
      </div>
    </div>
    <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border-color);border-radius:var(--radius-sm);padding:.5rem;background:var(--bg-secondary)">
      ${scheduleHtml}
    </div>
    <div class="form-row" style="margin-top:.75rem">
      <button class="btn btn-primary" onclick="saveEditEmployee(${id})">Salvar</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    </div>
  `, { large: true });
}

async function addSchedule(employeeId) {
  const startDate = document.getElementById('schedule-start').value;
  const endDate = document.getElementById('schedule-end').value;
  const type = document.getElementById('schedule-type').value;
  if (!startDate || !endDate) { showToast('Selecione data inicial e final', 'error'); return; }
  if (startDate > endDate) { showToast('Data inicial não pode ser maior que final', 'error'); return; }
  let allSchedules = [];
  try { allSchedules = await getCachedSchedules(); } catch (e) {}
  const existing = allSchedules.find(s => s.employee_id === employeeId && s.start_date === startDate);
  if (existing) {
    await db.updateSchedule(existing.id, { start_date: startDate, end_date: endDate, type });
  } else {
    await db.insertSchedule({ id: uid(), employee_id: employeeId, start_date: startDate, end_date: endDate, type });
  }
  invalidateCache('schedules');
  editEmployee(employeeId);
  showToast('Escala atualizada!', 'success');
}

async function deleteSchedule(id) {
  await db.deleteSchedule(id);
  invalidateCache('schedules');
  showToast('Registro removido.', 'info');
}

async function saveEditEmployee(id) {
  const name = document.getElementById('emp-name-edit').value.trim();
  const role = document.getElementById('emp-role-edit').value.trim();
  const status = document.getElementById('emp-status-edit').value;
  if (!name || !role) { showToast('Preencha nome e cargo', 'error'); return; }

  await db.updateEmployee(id, { name, role, status });
  invalidateCache('employees');
  closeModal();
  renderTeam();
  showToast('Funcionário atualizado!', 'success');
}

async function deleteEmployee(id) {
  if (!confirm('Remover este funcionário?')) return;
  await db.deleteEmployee(id);
  invalidateCache(['employees', 'tasks', 'participants', 'allocations']);
  renderTeam();
  showToast('Funcionário removido.', 'info');
}

async function createEmployeeLogin(empId) {
  const emp = await db.getEmployee(empId);
  if (!emp) { showToast('Funcionário não encontrado no banco de dados.', 'error'); return; }
  openModal('🔑 Criar Login: ' + emp.name, `
    <div style="font-size:.85rem;color:var(--text-muted);margin-bottom:.75rem">
      Crie um email e senha para <strong>${emp.name}</strong> acessar o sistema.
    </div>
    <div class="form-group"><label>Email</label><input type="email" id="cl-email" placeholder="email@exemplo.com"></div>
    <div class="form-group"><label>Senha</label><input type="password" id="cl-password" placeholder="mín. 4 caracteres"></div>
    <div class="form-group"><label>Nível de Acesso</label>
      <select id="cl-type">
        <option value="funcionario">Funcionário</option>
        <option value="auditor">Auditor</option>
        <option value="supervisor">Supervisor</option>
        <option value="gerente">Gerente</option>
        <option value="proprietario">Proprietário</option>
      </select>
    </div>
    <div class="login-error" id="cl-error" style="display:none;color:var(--red);font-size:.82rem;text-align:center"></div>
    <div class="form-row">
      <button class="btn btn-primary" onclick="saveEmployeeLogin(${empId})">Criar Login</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    </div>
  `);
}

async function saveEmployeeLogin(empId) {
  const email = document.getElementById('cl-email').value.trim();
  const password = document.getElementById('cl-password').value.trim();
  const type = document.getElementById('cl-type').value;
  const errEl = document.getElementById('cl-error');
  if (!email || !password) { errEl.textContent = 'Preencha email e senha.'; errEl.style.display = 'block'; return; }
  if (password.length < 4) { errEl.textContent = 'Mínimo 4 caracteres.'; errEl.style.display = 'block'; return; }

  const emp = await db.getEmployee(empId);
  if (!emp) return;

  errEl.textContent = 'Criando...';
  errEl.style.display = 'block';

  const result = await db.signupEmployee(email, password, emp.name, emp.company_id, emp.id, type);
  if (result.error) { errEl.textContent = result.error; return; }

  closeModal();
  showToast('Login criado para ' + emp.name + '! Email: ' + email, 'success');
}

/* ============================================
   TASKS
   ============================================ */
async function renderTasks() {
  const grid = document.getElementById('tasks-grid');
  let tasks = await getCachedTasks();
  const taskAssignees = await getCachedTaskAssignees() || [];
  const assigneeMap = {};
  for (const ta of taskAssignees) {
    if (!assigneeMap[ta.task_id]) assigneeMap[ta.task_id] = [];
    assigneeMap[ta.task_id].push(ta.employee_id);
  }
  const userId = currentUserId();

  if (isFuncionario()) {
    tasks = tasks.filter(t => t.assignee === userId || (assigneeMap[t.id] && assigneeMap[t.id].includes(userId)));
  }

  const filterStatus = document.getElementById('filter-task-status').value;
  const filterEmployee = document.getElementById('filter-task-employee').value;
  const filterSearch = document.getElementById('filter-task-search').value.toLowerCase();

  if (filterStatus !== 'all') tasks = tasks.filter(t => t.status === filterStatus);
  if (filterEmployee !== 'all') tasks = tasks.filter(t => {
    const fe = parseInt(filterEmployee);
    return t.assignee === fe || (assigneeMap[t.id] && assigneeMap[t.id].includes(fe));
  });
  if (filterSearch) tasks = tasks.filter(t => t.title.toLowerCase().includes(filterSearch));
  const dateStartInput = document.getElementById('filter-task-date-start');
  const dateEndInput = document.getElementById('filter-task-date-end');
  if (!dateStartInput.value) dateStartInput.value = todayBrasil();
  if (!dateEndInput.value) dateEndInput.value = todayBrasil();
  const dateStart = dateStartInput.value;
  const dateEnd = dateEndInput.value;
  tasks = tasks.filter(t => {
    if (t.recurrence !== 'none') return true;
    if (dateStart && t.date < dateStart) return false;
    if (dateEnd && t.date > dateEnd) return false;
    return true;
  });

  const employees = await getCachedEmployees();
  const empSelect = document.getElementById('filter-task-employee');
  const currentVal = empSelect.value;
  empSelect.innerHTML = '<option value="all">Todos os responsáveis</option>' +
    employees.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
  empSelect.value = currentVal;

  if (tasks.length === 0) {
    grid.innerHTML = '<div class="card"><div class="card-body" style="text-align:center;color:var(--text-muted);padding:2rem">Nenhuma tarefa encontrada</div></div>';
    return;
  }

  grid.innerHTML = tasks.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)).map(t => {
    const aIds = assigneeMap[t.id] || (t.assignee ? [t.assignee] : []);
    const names = aIds.map(id => employees.find(e => e.id === id)?.name || '—').join(', ');
    const overdue = t.status !== 'completed' && t.date < todayBrasil();
    const isCompleted = t.status === 'completed';
    const statusColor = overdue ? 'var(--red)' : isCompleted ? 'var(--green)' : t.status === 'in_progress' ? 'var(--blue)' : 'var(--amber)';
    const statusName = isCompleted ? 'Concluída' : overdue ? 'Atrasada' : statusLabel(t.status);
    return `<div class="task-card ${isCompleted ? 'completed' : ''} ${overdue ? 'overdue' : ''}" onclick="showTaskDetail(${t.id})">
      <div class="task-card-top">
        <span class="task-status-badge" style="background:${statusColor}">${statusName}</span>
        ${t.recurrence !== 'none' ? '<span class="task-badge recurring">🔄 ' + recurrenceLabel(t.recurrence) + '</span>' : ''}
        ${overdue ? '<span class="task-badge overdue-badge">⚠️ Atrasada</span>' : ''}
        <div class="task-title">${t.title}</div>
      </div>
      <div class="task-card-body">
        <div class="task-meta-row">
          <span class="task-meta-item person"><span class="meta-icon">👤</span> <strong class="task-person-name">${names}</strong></span>
          <span class="task-meta-item date"><span class="meta-icon">📅</span> <strong class="task-person-name">${formatDate(t.date)}</strong> <span class="meta-time">${formatTime(t.time)}</span></span>
          ${t.requires_evidence ? '<span class="task-meta-item evidence">📷 Com foto</span>' : ''}
        </div>
        ${t.evidence_description ? `<div class="task-evidence-row">✅ Comprovada em ${formatDateTime(t.evidence_timestamp)}</div>` : ''}
      </div>
      <div class="task-card-actions">
        ${!isCompleted ? `<button class="btn btn-sm btn-success" onclick="event.stopPropagation();executeTask(${t.id})">${t.requires_evidence ? '📷 Comprovar' : '✅ Concluir'}</button>` : '<span class="task-done-tag">✅ Concluída</span>'}
        ${isGestor() ? `<button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();editTask(${t.id})">Editar</button>
        <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteTask(${t.id})">Excluir</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

function showNewTaskModal() {
  if (isFuncionario()) { showToast('Apenas gestores podem criar tarefas', 'error'); return; }
  Promise.all([getCachedEmployees(), getCachedSchedules()]).then(([employees, schedules]) => {
    const today = todayBrasil();
    const workingEmployees = employees.filter(e => isWorkingDay(schedules, e.id, today));
    openModal('Nova Tarefa', `
      <div class="form-group"><label>Título</label><input type="text" id="task-title" placeholder="Título da tarefa"></div>
      <div class="form-group"><label>Descrição</label><textarea id="task-desc" placeholder="Descrição detalhada"></textarea></div>
      <div class="form-group"><label>Responsáveis</label>
        <div class="task-assignee-list">
          ${workingEmployees.map(e => `<label><input type="checkbox" class="task-assignee-cb" value="${e.id}"> ${e.name}</label>`).join('')}
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Data</label><input type="date" id="task-date"></div>
        <div class="form-group"><label>Hora</label><input type="time" id="task-time"></div>
      </div>
      <div class="form-group"><label>Recorrência</label>
        <select id="task-recurrence">
          ${recurrenceOptions().map(r => `<option value="${r.key}">${r.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group-check"><input type="checkbox" id="task-evidence"><label for="task-evidence">Exige comprovação</label></div>
      <div class="form-group-check"><input type="checkbox" id="task-photo"><label for="task-photo">Exige foto</label></div>
      <div class="form-row">
        <button class="btn btn-primary" onclick="saveNewTask()">Criar Tarefa</button>
        <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      </div>
    `);
    document.getElementById('task-date').valueAsDate = new Date();
    document.getElementById('task-time').value = new Date().toTimeString().slice(0, 5);
  });
}

function getSelectedAssignees() {
  const cbs = document.querySelectorAll('.task-assignee-cb:checked');
  return Array.from(cbs).map(cb => parseInt(cb.value)).filter(v => v);
}

async function saveNewTask() {
  const title = document.getElementById('task-title').value.trim();
  const description = document.getElementById('task-desc').value.trim();
  const assignees = getSelectedAssignees();
  const date = document.getElementById('task-date').value;
  const time = document.getElementById('task-time').value;
  const recurrence = document.getElementById('task-recurrence').value;
  const requiresEvidence = document.getElementById('task-evidence').checked;
  const requiresPhoto = document.getElementById('task-photo').checked;

  if (!title || !assignees.length || !date) { showToast('Preencha título, responsável(is) e data', 'error'); return; }

  const task = {
    id: uid(), title, description, assignee: assignees[0], date, time, recurrence,
    requires_evidence: requiresEvidence, requires_photo: requiresPhoto,
    status: 'pending', evidence_photo: '', evidence_description: '', evidence_timestamp: null,
    created_at: nowBrasilISO(),
  };

  await db.insertTask(task);
  for (const eid of assignees) {
    await db.insertTaskAssignee({ task_id: task.id, employee_id: eid });
  }
  invalidateCache(['tasks', 'taskAssignees']);

  const employees = await getCachedEmployees();
  const names = assignees.map(id => getEmployeeName(id, employees)).join(', ');
  showNotificationPopup(`📋 Nova tarefa: <strong>${title}</strong> para ${names}`, 'task');
  addNotification(`Nova tarefa <strong>${title}</strong> atribuída a ${names}.`, 'task', task.id);
  closeModal();
  renderTasks();
  showToast('Tarefa criada com sucesso!', 'success');
  runTriggerEngine('task_created', { taskId: task.id, title, assignee: assignees[0], sector: null });
}

async function editTask(id) {
  const t = await db.getTask(id);
  if (!t) return;
  const [employees, schedules] = await Promise.all([getCachedEmployees(), getCachedSchedules()]);
  const today = todayBrasil();
  const workingEmployees = employees.filter(e => isWorkingDay(schedules, e.id, today));
  const currentAssignees = await db.getTaskAssignees(id);
  const currentIds = currentAssignees.map(a => a.employee_id);
  if (!currentIds.length && t.assignee) currentIds.push(t.assignee);
  openModal('Editar Tarefa', `
    <div class="form-group"><label>Título</label><input type="text" id="task-title-edit" value="${t.title}"></div>
    <div class="form-group"><label>Descrição</label><textarea id="task-desc-edit">${t.description || ''}</textarea></div>
    <div class="form-group"><label>Responsáveis</label>
      <div class="task-assignee-list">
        ${workingEmployees.map(e => `<label><input type="checkbox" class="task-assignee-cb-edit" value="${e.id}" ${currentIds.includes(e.id) ? 'checked' : ''}> ${e.name}</label>`).join('')}
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Data</label><input type="date" id="task-date-edit" value="${t.date}"></div>
      <div class="form-group"><label>Hora</label><input type="time" id="task-time-edit" value="${t.time}"></div>
    </div>
    <div class="form-group"><label>Recorrência</label>
      <select id="task-recurrence-edit">
        ${recurrenceOptions().map(r => `<option value="${r.key}" ${t.recurrence === r.key ? 'selected' : ''}>${r.label}</option>`).join('')}
      </select>
    </div>
    <div class="form-group-check"><input type="checkbox" id="task-evidence-edit" ${t.requires_evidence ? 'checked' : ''}><label>Exige comprovação</label></div>
    <div class="form-group-check"><input type="checkbox" id="task-photo-edit" ${t.requires_photo ? 'checked' : ''}><label>Exige foto</label></div>
    <div class="form-row">
      <button class="btn btn-primary" onclick="saveEditTask(${id})">Salvar</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    </div>
  `);
}

async function saveEditTask(id) {
  const t = await db.getTask(id);
  if (!t) return;
  const title = document.getElementById('task-title-edit').value.trim();
  if (!title) { showToast('O título é obrigatório', 'error'); return; }

  const assigneeCbs = document.querySelectorAll('.task-assignee-cb-edit:checked');
  const assignees = Array.from(assigneeCbs).map(cb => parseInt(cb.value)).filter(v => v);

  await db.updateTask(id, {
    title,
    description: document.getElementById('task-desc-edit').value.trim(),
    assignee: assignees.length ? assignees[0] : t.assignee,
    date: document.getElementById('task-date-edit').value,
    time: document.getElementById('task-time-edit').value,
    recurrence: document.getElementById('task-recurrence-edit').value,
    requires_evidence: document.getElementById('task-evidence-edit').checked,
    requires_photo: document.getElementById('task-photo-edit').checked,
  });
  await db.deleteTaskAssignees(id);
  for (const eid of assignees) {
    await db.insertTaskAssignee({ task_id: id, employee_id: eid });
  }
  invalidateCache(['tasks', 'taskAssignees']);
  closeModal();
  renderTasks();
  showToast('Tarefa atualizada!', 'success');
}

async function deleteTask(id) {
  if (!confirm('Excluir esta tarefa?')) return;
  await db.deleteTask(id);
  invalidateCache('tasks');
  renderTasks();
  showToast('Tarefa excluída.', 'info');
}

async function showTaskDetail(id) {
  const [t, employees] = await Promise.all([db.getTask(id), getCachedEmployees()]);
  if (!t) return;
  const aIds = (await taskAssigneeIds(id)) || (t.assignee ? [t.assignee] : []);
  const names = aIds.map(eid => employees.find(e => e.id === eid)?.name || '—').join(', ');
  const overdue = t.status !== 'completed' && t.date < todayBrasil();

  const statusIcon = { pending: '⏳', in_progress: '🔄', completed: '✅' };
  const statusClass = { pending: 'Pendente', in_progress: 'Em Andamento', completed: 'Concluido' };

  let evidenceHtml = '';
  if (t.evidence_description || t.evidence_photo) {
    evidenceHtml = `
      <div class="detail-section">
        <h4>Comprovacao</h4>
        <div class="detail-evidence">
          ${t.evidence_photo ? `<div class="detail-photo"><img src="${t.evidence_photo}" class="image-preview evidence-thumb" style="max-width:100%;max-height:200px;cursor:pointer" onclick="event.stopPropagation();openPhotoZoom('${t.evidence_photo}')" onerror="this.style.display='none'"></div>` : ''}
          <div class="detail-evidence-text">
            <p><strong>Descricao:</strong> ${t.evidence_description || '—'}</p>
            <p><strong>Data/Hora:</strong> ${formatDateTime(t.evidence_timestamp)}</p>
          </div>
        </div>
      </div>`;
  }

  openModal(`${t.title}`, `
    <div class="task-detail">
      <div class="detail-status-bar ${t.status}" style="background:${overdue ? 'var(--red)' : t.status === 'completed' ? 'var(--green)' : t.status === 'in_progress' ? 'var(--blue)' : 'var(--amber)'};padding:.35rem .75rem;border-radius:var(--radius-sm);color:#fff;font-weight:600;font-size:.85rem;margin-bottom:1rem">
        ${overdue ? '⚠️ ATRASADA' : statusIcon[t.status]} ${statusClass[t.status]}
      </div>
      <div class="detail-grid">
        <div class="detail-section"><h4>👤 Responsaveis</h4><p>${names}</p></div>
        <div class="detail-section"><h4>📅 Data</h4><p>${formatDate(t.date)} as ${formatTime(t.time)}</p></div>
        <div class="detail-section"><h4>Recorrencia</h4><p>${t.recurrence === 'none' ? 'Sem recorrencia' : recurrenceLabel(t.recurrence)}</p></div>
        <div class="detail-section"><h4>📸 Comprovacao</h4><p>${t.requires_evidence ? 'Exige comprovacao' : 'Nao exige'} ${t.requires_photo ? '📷 + foto' : ''}</p></div>
      </div>
      ${t.description ? `<div class="detail-section"><h4>📝 Descricao</h4><p>${t.description}</p></div>` : ''}
      ${evidenceHtml}
      <div class="detail-section"><h4>Informacoes</h4><p>Criada em: ${formatDateTime(t.created_at)}</p></div>
      <div class="form-row" style="margin-top:1rem">
        ${t.status !== 'completed' ? `<button class="btn btn-${t.requires_evidence ? 'warning' : 'success'}" onclick="closeModal();executeTask(${t.id})">${t.requires_evidence ? 'Enviar Comprovacao' : 'Executar'}</button>` : ''}
        ${t.status === 'completed' && isGestor() ? `<button class="btn btn-sm btn-secondary" onclick="closeModal();rateTask(${t.id})">⭐ Avaliar</button>` : ''}
        ${isGestor() ? `<button class="btn btn-secondary" onclick="closeModal();editTask(${t.id})">Editar</button>
        <button class="btn btn-danger" onclick="if(confirm('Excluir?')){closeModal();deleteTask(${t.id})}">Excluir</button>` : ''}
        <button class="btn btn-secondary" onclick="closeModal()">Fechar</button>
      </div>
    </div>
  `, { large: true });
}

async function executeTask(id) {
  const t = await db.getTask(id);
  if (!t) return;

  if (t.requires_evidence) {
    showEvidenceModal(t);
    return;
  }

  const now = nowBrasilISO();
  await db.executeTask(id, 'completed', { photo: '', description: 'Concluída diretamente.', timestamp: now });
  invalidateCache('tasks');

  const employees = await getCachedEmployees();
  const executor = employees.find(e => e.user_id === currentUserId()) || employees.find(e => e.id === t.assignee);
  const executorName = executor ? executor.name : '—';
  showNotificationPopup(`✅ <strong>${t.title}</strong> concluida por ${executorName}.`, 'task');
  addNotification(`<strong>${t.title}</strong> foi concluída por ${executorName}.`, 'task', id);
  renderTasks();
  showToast('Tarefa concluída!', 'success');
  runTriggerEngine('task_completed', { taskId: id, title: t.title, assignee: t.assignee });
}

function showEvidenceModal(t) {
  Promise.all([getCachedEmployees(), getCachedTaskAssignees()]).then(([employees, taskAssignees]) => {
    const aIds = (taskAssignees || []).filter(a => a.task_id === t.id).map(a => a.employee_id);
    if (!aIds.length && t.assignee) aIds.push(t.assignee);
    const names = aIds.map(eid => employees.find(e => e.id === eid)?.name || '—').join(', ');
    openModal('Executar Tarefa: ' + t.title, `
      <div style="margin-bottom:.5rem;font-size:.88rem;color:var(--text-secondary)">${t.description || ''}</div>
      <div style="margin-bottom:1rem;font-size:.82rem;color:var(--text-muted)">Responsáveis: ${names} | Data: ${formatDate(t.date)}</div>
      ${t.requires_photo ? '<div style="margin-bottom:.75rem;padding:.5rem;background:rgba(245,158,11,.1);border-radius:var(--radius-sm);font-size:.85rem;color:var(--amber)">Esta tarefa exige upload de foto para conclusao.</div>' : ''}
      <div class="form-group"><label>Observação (opcional)</label><textarea id="evidence-desc" placeholder="Descreva a execução..."></textarea></div>
      <div class="form-group">
        <label>${t.requires_photo ? 'Upload de Foto (obrigatório)' : 'Upload de Imagem (opcional)'}</label>
        <div class="upload-area" id="upload-area" onclick="document.getElementById('evidence-file-input').click()">
          <div id="upload-placeholder">Clique para selecionar uma imagem</div>
          <img id="evidence-preview" class="image-preview" style="display:none">
        </div>
        <input type="file" id="evidence-file-input" accept="image/*" style="display:none">
      </div>
      <div class="form-row">
        <button class="btn btn-success btn-full" id="btn-submit-evidence" onclick="submitEvidence(${t.id})">✅ Confirmar Execucao</button>
      </div>
      <div class="form-row">
        <button class="btn btn-secondary btn-full" onclick="closeModal()">Cancelar</button>
      </div>
    `, { large: true });

    document.getElementById('evidence-file-input').addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function(ev) {
          const preview = document.getElementById('evidence-preview');
          preview.src = ev.target.result;
          preview.style.display = 'block';
          document.getElementById('upload-placeholder').textContent = 'Imagem selecionada';
          document.getElementById('upload-area').classList.add('has-image');
        };
        reader.readAsDataURL(file);
      }
    });
  });
}

async function submitEvidence(id) {
  const t = await db.getTask(id);
  if (!t) return;

  const desc = document.getElementById('evidence-desc').value.trim();
  const fileInput = document.getElementById('evidence-file-input');
  const file = fileInput && fileInput.files[0];

  if (t.requires_photo && !file) {
    showToast('Esta tarefa exige o upload de uma foto!', 'error');
    return;
  }

  let photoUrl = '';
  if (file) {
    try {
      photoUrl = await db.uploadPhoto(t.assignee, file);
    } catch (e) {
      showToast('Erro ao enviar foto. Tente novamente.', 'error');
      return;
    }
  }

  const now = nowBrasilISO();
  await db.executeTask(id, 'completed', { photo: photoUrl, description: desc || 'Executada com comprovação.', timestamp: now });
  invalidateCache('tasks');

  await db.updateEmployee(t.assignee, { status: 'free' });
  invalidateCache('employees');

  const employees = await getCachedEmployees();
  showNotificationPopup(`📸 <strong>${t.title}</strong> concluida com comprovacao por ${getEmployeeName(t.assignee, employees)}.`, 'task');
  addNotification(`<strong>${t.title}</strong> foi concluída com comprovação por ${getEmployeeName(t.assignee, employees)}.`, 'task', id);
  closeModal();
  renderTasks();
  showToast('Tarefa concluída com comprovação!', 'success');
}

/* ============================================
   MEETINGS
   ============================================ */
async function renderMeetings() {
  const grid = document.getElementById('meetings-grid');
  const [meetings, employees, participants] = await Promise.all([
    getCachedMeetings(), getCachedEmployees(), getCachedParticipants()
  ]);

  let filteredMeetings = meetings;

  if (isFuncionario()) {
    filteredMeetings = meetings.filter(m => participants.some(p => p.meeting_id === m.id && p.employee_id === currentUserId()));
  }

  if (filteredMeetings.length === 0) {
    grid.innerHTML = '<div class="card"><div class="card-body" style="text-align:center;color:var(--text-muted);padding:2rem">Nenhuma reunião agendada</div></div>';
    return;
  }

  grid.innerHTML = filteredMeetings.sort((a, b) => a.date.localeCompare(b.date)).map(m => {
    const mp = participants.filter(p => p.meeting_id === m.id);
    const confirmed = mp.filter(p => p.status === 'confirmed').length;
    const absent = mp.filter(p => p.status === 'absent').length;
    const maybe = mp.filter(p => p.status === 'maybe').length;
    const pending = mp.filter(p => p.status === 'pending').length;

    return `<div class="meeting-card">
      <div class="meeting-header">
        <div>
          <div class="meeting-title">${m.title}</div>
          <div class="meeting-date">📅 ${formatDate(m.date)} as ${formatTime(m.time)} • ${m.duration}min</div>
        </div>
        ${isGestor() ? `<div style="display:flex;gap:.4rem;flex-shrink:0">
          <button class="btn btn-sm btn-secondary" onclick="editMeeting(${m.id})">Editar</button>
          <button class="btn btn-sm btn-danger" onclick="deleteMeeting(${m.id})">Excluir</button>
        </div>` : ''}
      </div>
      ${m.description ? `<div style="font-size:.85rem;color:var(--text-secondary);margin-top:.5rem">${m.description}</div>` : ''}
      ${m.agenda && m.agenda.length > 0 ? `<div class="meeting-agenda"><strong>Pauta:</strong><ul>${(Array.isArray(m.agenda) ? m.agenda : []).map(a => `<li>${a}</li>`).join('')}</ul></div>` : ''}
      <div class="meeting-details">
        <span class="pill">✅ ${confirmed} confirmado(s)</span>
        <span class="pill">❌ ${absent} ausente(s)</span>
        <span class="pill">${maybe} talvez</span>
        <span class="pill">${pending} pendente(s)</span>
      </div>
      <div class="meeting-participants">
        <strong style="font-size:.85rem">Participantes:</strong>
        <div class="participant-pills" style="margin-top:.35rem">
          ${mp.map(p => {
            const emp = employees.find(e => e.id === p.employee_id);
            return `<span class="participant-pill ${p.status}">${emp ? emp.name : '—'} (${p.status === 'confirmed' ? 'Presente' : p.status === 'absent' ? 'Ausente' : p.status === 'maybe' ? 'Talvez' : 'Pendente'})</span>`;
          }).join('')}
        </div>
      </div>
      <div class="meeting-actions">
        ${mp.some(p => p.employee_id === App.state.user?.id) || isGestor() ? `
          <button class="btn btn-sm btn-success" onclick="confirmPresence(${m.id}, 'confirmed')">✅ Confirmar Presenca</button>
          <button class="btn btn-sm btn-secondary" onclick="confirmPresence(${m.id}, 'maybe')">Talvez</button>
          <button class="btn btn-sm btn-danger" onclick="confirmPresence(${m.id}, 'absent')">Ausente</button>
        ` : ''}
        ${isGestor() ? `
          <button class="btn btn-sm btn-secondary" onclick="addParticipantToMeeting(${m.id})">+ Participante</button>
        ` : ''}
      </div>
    </div>`;
  }).join('');
}

function showNewMeetingModal() {
  if (isFuncionario()) { showToast('Apenas gestores podem criar reuniões', 'error'); return; }
  getCachedEmployees().then(employees => {
    openModal('Nova Reunião', `
      <div class="form-group"><label>Título</label><input type="text" id="meet-title" placeholder="Título da reunião"></div>
      <div class="form-group"><label>Descrição</label><textarea id="meet-desc" placeholder="Descrição..."></textarea></div>
      <div class="form-row">
        <div class="form-group"><label>Data</label><input type="date" id="meet-date"></div>
        <div class="form-group"><label>Hora</label><input type="time" id="meet-time"></div>
      </div>
      <div class="form-group"><label>Duração Estimada (minutos)</label><input type="number" id="meet-duration" value="60" min="15" step="15"></div>
      <div class="form-group"><label>Pauta (um tópico por linha)</label><textarea id="meet-agenda" placeholder="Tópico 1\nTópico 2\nTópico 3" rows="3"></textarea></div>
      <div class="form-group"><label>Participantes</label>
        <div style="display:flex;flex-wrap:wrap;gap:.35rem;max-height:120px;overflow-y:auto;padding:.25rem 0">
          ${employees.map(e => `<label style="display:flex;align-items:center;gap:.3rem;font-size:.85rem;width:calc(50% - .2rem)"><input type="checkbox" class="meet-participant" value="${e.id}"> ${e.name}</label>`).join('')}
        </div>
      </div>
      <div class="form-row">
        <button class="btn btn-primary" onclick="saveNewMeeting()">Criar Reunião</button>
        <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      </div>
    `, { large: true });
    document.getElementById('meet-date').valueAsDate = new Date(new Date().getTime() + 864e5);
    document.getElementById('meet-time').value = '10:00';
  });
}

async function saveNewMeeting() {
  const title = document.getElementById('meet-title').value.trim();
  const description = document.getElementById('meet-desc').value.trim();
  const date = document.getElementById('meet-date').value;
  const time = document.getElementById('meet-time').value;
  const duration = parseInt(document.getElementById('meet-duration').value) || 60;
  const agendaText = document.getElementById('meet-agenda').value.trim();
  const agenda = agendaText ? agendaText.split('\n').filter(l => l.trim()).map(l => l.trim()) : [];

  const participantCheckboxes = document.querySelectorAll('.meet-participant:checked');
  const selectedIds = Array.from(participantCheckboxes).map(cb => parseInt(cb.value));

  if (!title || !date || !time || selectedIds.length === 0) {
    showToast('Preencha título, data, horário e selecione participantes', 'error');
    return;
  }

  const meetingId = uid();
  const meeting = {
    id: meetingId, title, description, date, time, duration,
    agenda, attachments: [],
    created_at: nowBrasilISO(),
  };

  await db.insertMeeting(meeting);

  const participantRecords = selectedIds.map((empId, idx) => ({
    id: uid() + idx, meeting_id: meetingId, employee_id: empId, status: 'pending',
  }));
  await db.bulkInsertParticipants(participantRecords);

  invalidateCache(['meetings', 'participants']);
  showNotificationPopup(`📅 Reuniao: <strong>${title}</strong> marcada para ${formatDate(date)}`, 'meeting');
  addNotification(`Reunião <strong>${title}</strong> criada para ${formatDate(date)}.`, 'meeting', meetingId);
  closeModal();
  renderMeetings();
  showToast('Reunião criada com sucesso!', 'success');
}

async function editMeeting(id) {
  const [m, employees] = await Promise.all([db.getMeeting(id), getCachedEmployees()]);
  if (!m) return;

  const participants = await db.getParticipants(id);
  const participantIds = participants.map(p => p.employee_id);

  openModal('Editar Reunião', `
    <div class="form-group"><label>Título</label><input type="text" id="meet-title-edit" value="${m.title}"></div>
    <div class="form-group"><label>Descrição</label><textarea id="meet-desc-edit">${m.description || ''}</textarea></div>
    <div class="form-row">
      <div class="form-group"><label>Data</label><input type="date" id="meet-date-edit" value="${m.date}"></div>
      <div class="form-group"><label>Hora</label><input type="time" id="meet-time-edit" value="${m.time}"></div>
    </div>
    <div class="form-group"><label>Duração</label><input type="number" id="meet-duration-edit" value="${m.duration}" min="15" step="15"></div>
    <div class="form-group"><label>Pauta</label><textarea id="meet-agenda-edit" rows="3">${Array.isArray(m.agenda) ? m.agenda.join('\n') : ''}</textarea></div>
    <div class="form-group"><label>Participantes</label>
      <div style="display:flex;flex-wrap:wrap;gap:.35rem;max-height:120px;overflow-y:auto;padding:.25rem 0">
        ${employees.map(e => `<label style="display:flex;align-items:center;gap:.3rem;font-size:.85rem;width:calc(50% - .2rem)"><input type="checkbox" class="meet-participant-edit" value="${e.id}" ${participantIds.includes(e.id) ? 'checked' : ''}> ${e.name}</label>`).join('')}
      </div>
    </div>
    <div class="form-row">
      <button class="btn btn-primary" onclick="saveEditMeeting(${id})">Salvar</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    </div>
  `, { large: true });
}

async function saveEditMeeting(id) {
  const title = document.getElementById('meet-title-edit').value.trim();
  if (!title) { showToast('Título obrigatório', 'error'); return; }

  const agendaText = document.getElementById('meet-agenda-edit').value.trim();
  const agenda = agendaText ? agendaText.split('\n').filter(l => l.trim()).map(l => l.trim()) : [];

  await db.updateMeeting(id, {
    title,
    description: document.getElementById('meet-desc-edit').value.trim(),
    date: document.getElementById('meet-date-edit').value,
    time: document.getElementById('meet-time-edit').value,
    duration: parseInt(document.getElementById('meet-duration-edit').value) || 60,
    agenda,
  });

  // Update participants
  const participantCheckboxes = document.querySelectorAll('.meet-participant-edit:checked');
  const selectedIds = Array.from(participantCheckboxes).map(cb => parseInt(cb.value));

  await db.deleteParticipantsByMeeting(id);
  const newParticipants = selectedIds.map((empId, idx) => ({
    id: uid() + idx, meeting_id: id, employee_id: empId, status: 'pending',
  }));
  if (newParticipants.length > 0) {
    await db.bulkInsertParticipants(newParticipants);
  }

  invalidateCache(['meetings', 'participants']);
  closeModal();
  renderMeetings();
  showToast('Reunião atualizada!', 'success');
}

async function deleteMeeting(id) {
  if (!confirm('Excluir esta reunião?')) return;
  await db.deleteMeeting(id);
  invalidateCache(['meetings', 'participants']);
  renderMeetings();
  showToast('Reunião excluída.', 'info');
}

async function confirmPresence(meetingId, status) {
  const participants = await db.getParticipants(meetingId);
  let p = participants.find(pp => pp.employee_id === App.state.user?.id);

  if (p) {
    await db.updateParticipant(p.id, { status });
  } else {
    const newP = { id: uid(), meeting_id: meetingId, employee_id: App.state.user?.id || 1, status };
    await db.insertParticipant(newP);
  }

  invalidateCache('participants');
  renderMeetings();
  const msgs = { confirmed: 'Presença confirmada!', maybe: 'Status alterado para Talvez.', absent: 'Ausência registrada.' };
  showToast(msgs[status] || 'Status atualizado!', 'success');
}

async function addParticipantToMeeting(meetingId) {
  const [employees, participants, schedules] = await Promise.all([getCachedEmployees(), db.getParticipants(meetingId), getCachedSchedules()]);
  const participantIds = participants.map(p => p.employee_id);
  const today = todayBrasil();
  const available = employees.filter(e => !participantIds.includes(e.id) && isWorkingDay(schedules, e.id, today));

  if (available.length === 0) { showToast('Todos já participam', 'info'); return; }

  openModal('Adicionar Participante', `
    <div class="form-group"><label>Selecione</label>
      <select id="new-participant">${available.map(e => `<option value="${e.id}">${e.name}</option>`).join('')}</select>
    </div>
    <div class="form-row">
      <button class="btn btn-primary" onclick="doAddParticipant(${meetingId})">Adicionar</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    </div>
  `);
}

async function doAddParticipant(meetingId) {
  const empId = parseInt(document.getElementById('new-participant').value);
  await db.insertParticipant({ id: uid(), meeting_id: meetingId, employee_id: empId, status: 'pending' });
  invalidateCache('participants');
  closeModal();
  renderMeetings();
  showToast('Participante adicionado!', 'success');
}

/* ============================================
   REPORTS
   ============================================ */
async function renderReports() {
  const range = getDateRange(App.state.period || 'month');
  const [allTasks, allMeetings, employees, participants, allAllocs, schedules] = await Promise.all([
    getCachedTasks(), getCachedMeetings(), getCachedEmployees(), getCachedParticipants(), getCachedAllocations(), getCachedSchedules()
  ]);

  let tasks = filterByPeriod(allTasks, 'date', range);
  let meetings = allMeetings.filter(m => m.date >= range.start && m.date <= range.end);

  if (isFuncionario()) {
    tasks = tasks.filter(t => t.assignee === currentUserId());
    meetings = meetings.filter(m => participants.some(p => p.meeting_id === m.id && p.employee_id === currentUserId()));
  }

  const now = todayBrasil();

  // ——— BASE METRICS ———
  const totalTasks = tasks.length;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const pending = tasks.filter(t => t.status === 'pending').length;
  const inProgress = tasks.filter(t => t.status === 'in_progress').length;
  const overdue = tasks.filter(t => t.status !== 'completed' && t.date < now).length;
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const completedOnTime = completedTasks.filter(t => t.date <= t.date).length;
  const completionRate = totalTasks > 0 ? Math.round(completed / totalTasks * 100) : 0;
  const onTimeRate = completedTasks.length > 0 ? Math.round(completedTasks.filter(t => t.date <= now).length / completedTasks.length * 100) : 0;

  // ——— DAILY ACCUMULATION ———
  const dayTaskCounts = {};
  const dayStart = new Date(range.start + 'T12:00:00');
  const dayEnd = new Date(range.end + 'T12:00:00');
  for (let d = new Date(dayStart); d <= dayEnd; d.setDate(d.getDate() + 1)) {
    const ds = d.toISOString().slice(0, 10);
    dayTaskCounts[ds] = { total: 0, completed: 0, created: 0 };
  }
  tasks.forEach(t => {
    if (dayTaskCounts[t.date]) dayTaskCounts[t.date].total++;
    if (dayTaskCounts[t.date] && t.status === 'completed') dayTaskCounts[t.date].completed++;
    const created = t.created_at ? t.created_at.slice(0, 10) : '';
    if (dayTaskCounts[created]) dayTaskCounts[created].created++;
  });
  const dayLabels = Object.keys(dayTaskCounts);
  const dayTotals = dayLabels.map(d => dayTaskCounts[d].total);
  const dayDone = dayLabels.map(d => dayTaskCounts[d].completed);

  // --- ALLOCATION / SECTOR METRICS ---
  const periodAllocs = allAllocs.filter(a => {
    const ad = a.allocated_at ? a.allocated_at.slice(0, 10) : '';
    return ad >= range.start && ad <= range.end;
  });
  const allocEmployees = new Set(periodAllocs.filter(a => a.area !== null).map(a => a.employee_id)).size;
  const totalAllocEvents = periodAllocs.filter(a => a.area !== null).length;

  // --- EMPLOYEE / VACATION METRICS ---
  const activeEmployees = employees.filter(e => e.status !== 'free').length;
  const onVacation = employees.filter(e => schedules.some(s => s.employee_id === e.id && s.start_date <= range.end && s.end_date >= range.start && s.type === 'vacation')).length;

  // === RENDER STATS ===
  const daysInPeriod = Math.max(1, Math.round((new Date(range.end) - new Date(range.start)) / 864e5) + 1);
  const tasksPerEmployee = employees.length > 0 ? (totalTasks / employees.length).toFixed(1) : 0;
  const overdueRate = totalTasks > 0 ? Math.round(overdue / totalTasks * 100) : 0;
  const avgTasksPerDay = daysInPeriod > 0 ? (totalTasks / daysInPeriod).toFixed(1) : '0';
  const effRate = totalTasks > 0 ? Math.round((completed - overdue) / totalTasks * 100) : 0;

  document.getElementById('reports-stats').innerHTML = `
    <div class="reports-stats-grid">
      <div class="stat-card primary">
        <div class="stat-value" style="color:${completionRate >= 80 ? 'var(--green)' : completionRate >= 50 ? 'var(--amber)' : 'var(--red)'}">${completionRate}%</div>
        <div class="stat-label">Taxa de Conclusao</div>
        <div class="stat-sub">${completed}/${totalTasks} tarefas concluidas</div>
      </div>
      <div class="stat-card warn">
        <div class="stat-value" style="color:${overdue > 0 ? 'var(--red)' : 'var(--green)'}">${overdue}</div>
        <div class="stat-label">Atrasadas (${overdueRate}%)</div>
        <div class="stat-sub">${inProgress} em andamento • ${pending} pendentes</div>
      </div>
      <div class="stat-card info">
        <div class="stat-value">${avgTasksPerDay}</div>
        <div class="stat-label">Tarefas por Dia</div>
        <div class="stat-sub">${daysInPeriod} dias no periodo</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${effRate}%</div>
        <div class="stat-label">Eficiencia Real</div>
        <div class="stat-sub">${onTimeRate}% concluidas no prazo</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-value">${allocEmployees}</div>
        <div class="stat-label">Funcionarios Alocados</div>
        <div class="stat-sub">${totalAllocEvents} eventos de alocacao</div>
      </div>
      <div class="stat-card purple">
        <div class="stat-value">${onVacation}</div>
        <div class="stat-label">De Ferias</div>
        <div class="stat-sub">${activeEmployees} ativos • ${employees.length - activeEmployees - onVacation} disponiveis</div>
      </div>
    </div>
  `;

  // === CHARTS ===
  const chartContainer = document.getElementById('reports-charts');
  if (!chartContainer) return;

  const empPerfData = await Promise.all(employees.map(async emp => {
    const perf = await getEmployeePerformance(emp.id, allTasks, allMeetings, participants);
    return { emp, perf };
  }));
  empPerfData.sort((a, b) => b.perf.rate - a.perf.rate);

  const topEmployees = empPerfData.slice(0, 6);
  const maxTotal = Math.max(...topEmployees.map(d => d.perf.total || 1), 1);

  const meetingData = meetings.slice(0, 8).map(m => ({
    name: m.title.length > 20 ? m.title.slice(0, 18) + '..' : m.title,
    confirmed: participants.filter(p => p.meeting_id === m.id && p.status === 'confirmed').length,
    total: participants.filter(p => p.meeting_id === m.id).length,
  }));

  const maxDayCount = Math.max(...dayTotals, ...dayDone, 1);

  chartContainer.innerHTML = `
    <div class="reports-charts-grid">
      <div class="card report-card full-width">
        <div class="card-header"><h3>📈 Fluxo Diario de Tarefas</h3></div>
        <div class="card-body">
          <div class="css-chart daily">
            ${dayLabels.map((d, i) => {
              const pctTotal = maxDayCount > 0 ? Math.round(dayTotals[i] / maxDayCount * 100) : 0;
              const pctDone = maxDayCount > 0 ? Math.round(dayDone[i] / maxDayCount * 100) : 0;
              return `<div class="chart-bar-row">
                <span class="chart-bar-label" style="width:50px;font-size:.65rem">${d.slice(5)}</span>
                <div class="chart-bar-track">
                  <div class="chart-bar-fill total" style="width:${pctTotal}%"></div>
                  <div class="chart-bar-fill done" style="width:${pctDone}%"></div>
                </div>
                <span class="chart-bar-value" style="width:50px;font-size:.7rem">${dayDone[i]}/${dayTotals[i]}</span>
              </div>`;
            }).join('')}
          </div>
          <div class="chart-legend">
            <span><span class="legend-dot" style="background:#3a3a6a"></span> Total</span>
            <span><span class="legend-dot" style="background:#10b981"></span> Concluidas</span>
          </div>
        </div>
      </div>

      <!-- Employee productivity bar -->
      <div class="card report-card">
        <div class="card-header"><h3>🏆 Produtividade por Funcionario</h3></div>
        <div class="card-body">
          <div class="css-chart bars">
            ${topEmployees.map(d => {
              const pct = Math.round(d.perf.total / maxTotal * 100);
              const donePct = Math.round(d.perf.completed / maxTotal * 100);
              return `<div class="chart-bar-row">
                <span class="chart-bar-label" title="${d.emp.name}">${d.emp.name.split(' ')[0]}</span>
                <div class="chart-bar-track">
                  <div class="chart-bar-fill total" style="width:${pct}%"></div>
                  <div class="chart-bar-fill done" style="width:${donePct}%"></div>
                </div>
                <span class="chart-bar-value">${d.perf.rate}%</span>
              </div>`;
            }).join('')}
          </div>
          <div class="chart-legend">
            <span><span class="legend-dot" style="background:#3a3a6a"></span> Total</span>
            <span><span class="legend-dot" style="background:#10b981"></span> Concluidas</span>
            <span style="margin-left:auto;font-size:.7rem;color:var(--text-muted)">Media: ${completionRate}%</span>
          </div>
        </div>
      </div>

      <!-- Task status breakdown -->
      <div class="card report-card">
        <div class="card-header"><h3>📊 Status das Tarefas</h3></div>
        <div class="card-body">
          <div class="css-chart status">
            ${[
              { label: 'Concluido', count: completed, color: '#10b981' },
              { label: 'Em Andamento', count: inProgress, color: '#3b82f6' },
              { label: 'Pendente', count: pending, color: '#f59e0b' },
              { label: 'Atrasado', count: overdue, color: '#ef4444' },
            ].map(s => {
              const pct = totalTasks > 0 ? Math.round(s.count / totalTasks * 100) : 0;
              return `<div class="chart-bar-row">
                <span class="chart-bar-label">${s.label}</span>
                <div class="chart-bar-track">
                  <div class="chart-bar-fill" style="width:${pct}%;background:${s.color}"></div>
                </div>
                <span class="chart-bar-value" style="color:${s.color}">${s.count} (${pct}%)</span>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- Meeting presence -->
      <div class="card report-card full-width">
        <div class="card-header"><h3>📅 Presenca em Reunioes (${meetings.length} reunioes)</h3></div>
        <div class="card-body">
          ${meetingData.length === 0 ? '<p style="color:var(--text-muted);text-align:center;padding:1rem">Nenhuma reuniao no periodo.</p>' : `
          <div class="css-chart meetings">
            ${meetingData.map(m => {
              const pct = m.total > 0 ? Math.round(m.confirmed / m.total * 100) : 0;
              return `<div class="chart-bar-row">
                <span class="chart-bar-label" title="${m.name}">${m.name}</span>
                <div class="chart-bar-track">
                  <div class="chart-bar-fill" style="width:${pct}%;background:#8b5cf6"></div>
                </div>
                <span class="chart-bar-value" style="color:#8b5cf6">${m.confirmed}/${m.total}</span>
              </div>`;
            }).join('')}
          </div>`}
        </div>
      </div>
    </div>
  `;

  // === PERFORMANCE INDIVIDUAL ===
  const perfContainer = document.getElementById('reports-perf-employees');
  const perfEmployees = isFuncionario()
    ? employees.filter(e => e.id === currentUserId())
    : employees;

  const fullPerfData = await Promise.all(perfEmployees.map(async emp => {
    const perf = await getEmployeePerformance(emp.id, allTasks, allMeetings, participants);
    const empAllocs = periodAllocs.filter(a => a.employee_id === emp.id && a.area !== null);
    const allocDays = new Set(empAllocs.map(a => a.allocated_at ? a.allocated_at.slice(0, 10) : '')).size;
    return { emp, perf, allocDays };
  }));
  fullPerfData.sort((a, b) => b.perf.rate - a.perf.rate);
  const avgPerf = fullPerfData.length > 0 ? Math.round(fullPerfData.reduce((s, p) => s + p.perf.rate, 0) / fullPerfData.length) : 0;

  perfContainer.innerHTML = `
    <div class="section-title" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem">
      <h3>👤 Performance Individual</h3>
      <span style="font-size:.78rem;color:var(--text-muted)">Media da equipe: <strong style="color:${perfColor(avgPerf)}">${avgPerf}%</strong></span>
    </div>
    <div class="perf-employees-grid">
      ${fullPerfData.map(({ emp, perf, allocDays }) => `
        <div class="perf-emp-card">
          <div class="perf-emp-header">
            <div class="emp-avatar" style="background:${randomColor(emp.name)}">${getInitials(emp.name)}</div>
            <div>
              <div class="perf-emp-name" onclick="showEmployeeMapDetail(${emp.id})" style="cursor:pointer">${emp.name}</div>
              <div class="perf-emp-role">${emp.role}</div>
            </div>
            <div class="perf-emp-rate" style="color:${perfColor(perf.rate)};font-size:1.3rem">${perf.rate}%</div>
          </div>
          <div class="perf-emp-bar"><div class="progress-bar"><div class="progress-fill" style="width:${perf.rate}%;background:${perfColor(perf.rate)}"></div></div></div>
          <div class="perf-emp-details">
            <span>✅ ${perf.completed}/${perf.total} tarefas</span>
            <span style="color:${perf.overdue > 0 ? 'var(--red)' : 'var(--green)'}">⚠️ ${perf.overdue} atrasadas</span>
            <span>📅 ${perf.meetings} reunioes (${perf.meetingRate}%)</span>
            <span>📍 ${allocDays} dias alocado</span>
          </div>
          <div class="perf-emp-actions">
            <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();showEmployeeTasks(${emp.id}, 'pending')">⏳ Pendentes (${perf.pending})</button>
            <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();showEmployeeTasks(${emp.id})">📋 Todas</button>
          </div>
        </div>
      `).join('')}
    </div>`;

  // === PERFORMANCE POR SETOR ===
  if (isGestor()) {
    const areaContainer = document.getElementById('reports-perf-areas');
    const areaPerfData = await Promise.all(areasList.map(a => getAreaPerformance(a.id, allAllocs, employees, allTasks)));

    const totalFuncSetores = areaPerfData.reduce((s, p) => s + p.employeeCount, 0);
    const totalTarefasSetores = areaPerfData.reduce((s, p) => s + p.totalTasks, 0);
    const totalConcluidasSetores = areaPerfData.reduce((s, p) => s + p.completedTasks, 0);
    const totalAtrasadasSetores = areaPerfData.reduce((s, p) => s + p.overdueTasks, 0);
    const taxaGeralSetores = totalTarefasSetores > 0 ? Math.round(totalConcluidasSetores / totalTarefasSetores * 100) : 0;

    areaContainer.innerHTML = `
      <div class="section-title" style="margin-top:1.5rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem">
        <h3>🏢 Performance por Setor</h3>
        <span style="font-size:.78rem;color:var(--text-muted)">Geral: <strong style="color:${perfColor(taxaGeralSetores)}">${taxaGeralSetores}%</strong> • ${totalFuncSetores} func. • ${totalTarefasSetores} tarefas</span>
      </div>
      <div class="perf-areas-grid">
        ${areasList.map((a, i) => {
          const perf = areaPerfData[i];
          const goal = sectorGoals[a.id];
          const capPct = perf.employeeCount > 0 ? Math.round(perf.employeeCount / a.maxCapacity * 100) : 0;
          return `<div class="perf-area-card">
            <div class="perf-area-header">
              <span>${a.icon || ''} <strong onclick="showAreaMapDetail('${a.id}')" style="cursor:pointer">${a.name}</strong></span>
              <span class="perf-emp-rate" style="color:${perfColor(perf.completionRate)};font-size:1.1rem">${perf.completionRate}%</span>
            </div>
            <div class="perf-area-goal">${goal.goal} — ${goal.target}</div>
            <div class="progress-bar"><div class="progress-fill" style="width:${perf.completionRate}%;background:${perfColor(perf.completionRate)}"></div></div>
            <div class="perf-emp-details" style="margin-top:.35rem;display:flex;flex-wrap:wrap;gap:.35rem">
              <span>👥 ${perf.employeeCount}/${a.maxCapacity} (${capPct}% ocup.)</span>
              <span>📋 ${perf.totalTasks} tarefas</span>
              <span>✅ ${perf.completedTasks} concluidas</span>
              <span style="color:${perf.overdueTasks > 0 ? 'var(--red)' : 'var(--green)'}">⚠️ ${perf.overdueTasks} atrasadas</span>
            </div>
            <div class="perf-emp-actions">
              <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();showAreaTasks('${a.id}')">📋 Ver tarefas</button>
            </div>
          </div>`;
        }).join('')}
      </div>`;
  }
}

/* ============================================
   OPERATIONAL MAP
   ============================================ */
async function renderMap() {
  if (!App.state.mapDate) {
    App.state.mapDate = todayBrasil();
  }
  const mapDate = App.state.mapDate;
  const [allocations, employees, schedules] = await Promise.all([getCachedAllocations(), getCachedEmployees(), getCachedSchedules()]);

  const allocationsAtDate = getAllocationsAtDate(allocations, mapDate);

  const areasContainer = document.getElementById('map-areas');
  areasContainer.innerHTML = (await Promise.all(areasList.map(async area => {
    const areaAllocs = allocationsAtDate.filter(a => a.area === area.id);
    const count = areaAllocs.length;
    const capStatus = count > area.maxCapacity ? 'overload' : count >= area.maxCapacity ? 'attention' : 'normal';
    const areaPerf = await getAreaPerformance(area.id, allocations, employees);
    const goal = sectorGoals[area.id];
    const perfClass = areaPerf.completionRate >= 80 ? 'green' : areaPerf.completionRate >= 50 ? 'amber' : 'red';

    const canAllocHere = selectedEmpId && !areaAllocs.some(a => a.employee_id === selectedEmpId);
    return `<div class="map-area status-${capStatus} ${canAllocHere ? 'area-tap-target' : ''}" data-area="${area.id}"
        ondragover="onDragOver(event)" ondrop="onDrop(event)" ondragleave="onDragLeave(event)"
        onclick="${canAllocHere ? `allocSelectedToArea('${area.id}')` : ''}">
      <div class="area-header" onclick="${canAllocHere ? `event.stopPropagation();allocSelectedToArea('${area.id}')` : `showAreaMapDetail('${area.id}')`}" style="cursor:pointer">
        <div>
          <span class="area-name">${area.icon} ${area.name}</span>
          <span class="area-count">${count}/${area.maxCapacity} pessoas</span>
        </div>
        <div class="area-cap-status">
          <span class="area-status-dot ${capStatus}"></span>
          <span style="font-size:.7rem;color:var(--text-muted)">${capStatus === 'normal' ? 'OK' : capStatus === 'attention' ? 'Cheio' : 'Lotado'}</span>
        </div>
      </div>
      ${canAllocHere ? '<div class="tap-hint">👆 Toque para alocar aqui</div>' : ''}
      <div class="area-goal">
        <div class="area-goal-text"><strong>🎯 Meta:</strong> ${goal.goal}</div>
        <div class="area-goal-target">Alvo: ${goal.target}</div>
        <div class="area-goal-bar">
          <div class="progress-bar"><div class="progress-fill ${perfClass}" style="width:${areaPerf.completionRate}%"></div></div>
          <span class="area-goal-pct" style="color:${perfColor(areaPerf.completionRate)}">${areaPerf.completionRate}%</span>
        </div>
      </div>
      <div class="area-stats-row">
        <span>${areaPerf.totalTasks} tarefas</span>
        <span>✅ ${areaPerf.completedTasks} concluidas</span>
        <span style="color:var(--red)">⚠️ ${areaPerf.overdueTasks} atrasadas</span>
      </div>
      <div class="area-employees" id="area-${area.id}">
        ${areaAllocs.map(a => {
          const emp = employees.find(e => e.id === a.employee_id);
          if (!emp) return '';
          const isSelected = selectedEmpId === emp.id;
          return `<div class="emp-card${isSelected ? ' selected' : ''}${emp.id === App.state.user?.id ? ' current-user' : ''}" draggable="true" ondragstart="onDragStart(event, ${emp.id})" onclick="event.stopPropagation();toggleMobileSelect(${emp.id})" data-emp-id="${emp.id}" title="${emp.name}">
            <div class="emp-card-avatar" style="background:${randomColor(emp.name)}">${getInitials(emp.name)}</div>
            <div class="emp-card-info">
              <div class="emp-card-name">${emp.name.split(' ')[0]}</div>
              <div class="emp-card-role">${emp.role}</div>
              ${isSelected ? '<div class="emp-card-selected-badge">Selecionado</div>' : ''}
            </div>
            <button class="emp-card-remove" onclick="event.stopPropagation();removeFromArea(${emp.id})" title="Remover da área">&times;</button>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  })).then(r => r.join('')));

  // Pool — exclude vacation employees
  const allocatedIds = allocationsAtDate.map(a => a.employee_id);
  const poolEmployees = employees.filter(e => !allocatedIds.includes(e.id) && isWorkingDay(schedules, e.id, mapDate));
  const vacationEmployees = employees.filter(e => !allocatedIds.includes(e.id) && !isWorkingDay(schedules, e.id, mapDate));
  const pool = document.getElementById('map-pool');
  const poolItems = poolEmployees.length > 0 ? poolEmployees.map(emp => {
    const isSelected = selectedEmpId === emp.id;
    return `<div class="emp-card pool${isSelected ? ' selected' : ''}${emp.id === App.state.user?.id ? ' current-user' : ''}" draggable="true" ondragstart="onDragStart(event, ${emp.id})" onclick="toggleMobileSelect(${emp.id})" data-emp-id="${emp.id}" title="${emp.name}">
      <div class="emp-card-avatar" style="background:${randomColor(emp.name)}">${getInitials(emp.name)}</div>
      <div class="emp-card-info">
        <div class="emp-card-name">${emp.name.split(' ')[0]}</div>
        <div class="emp-card-role">${emp.role}</div>
        ${isSelected ? '<div class="emp-card-selected-badge">Selecionado</div>' : ''}
      </div>
    </div>`;
  }).join('') : '<div style="color:var(--text-muted);font-size:.85rem;text-align:center;width:100%;padding:1rem">Todos os funcionários disponíveis estão alocados</div>';
  pool.innerHTML = (selectedEmpId ? '<div class="pool-actions"><button class="btn btn-sm btn-ghost" onclick="selectedEmpId=null;renderMap()">✕ Cancelar seleção</button></div>' : '') + poolItems;

  // Vacation pool
  const vacationPool = document.getElementById('map-vacation');
  if (vacationPool) {
    vacationPool.innerHTML = vacationEmployees.length > 0 ? vacationEmployees.map(emp => `
      <div class="emp-card pool vacation" title="${emp.name} (Férias)" style="opacity:.6;cursor:default">
        <div class="emp-card-avatar" style="background:${randomColor(emp.name)}">${getInitials(emp.name)}</div>
        <div class="emp-card-info">
          <div class="emp-card-name">${emp.name.split(' ')[0]}</div>
          <div class="emp-card-role">🏖️ Ferias</div>
        </div>
      </div>
    `).join('') : '';
  }
}

function getAllocationsAtDate(allocations, dateStr) {
  return allocations.filter(a => {
    const ad = a.allocated_at ? a.allocated_at.slice(0, 10) : '';
    return ad === dateStr && a.area !== null;
  });
}

async function getAllocationsAtDateAndArea(empId, dateStr) {
  const allocs = await getCachedAllocations();
  return allocs.find(a => {
    const ad = a.allocated_at ? a.allocated_at.slice(0, 10) : '';
    return a.employee_id === empId && ad === dateStr && a.area !== null;
  });
}

let draggedEmpId = null;
let isDragging = false;
let selectedEmpId = null; // for mobile touch selection

function toggleMobileSelect(empId) {
  if (selectedEmpId === empId) {
    selectedEmpId = null;
  } else {
    selectedEmpId = empId;
  }
  renderMap();
}

function onDragStart(e, empId) {
  isDragging = true;
  draggedEmpId = empId;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', empId.toString());
  e.target.classList.add('dragging');
}

document.addEventListener('dragend', () => {
  isDragging = false;
  draggedEmpId = null;
});

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function onDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

async function onDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const areaId = e.currentTarget.dataset.area;
  if (!areaId || !draggedEmpId) return;
  // prevent allocating employees on vacation
  const schedules = await getCachedSchedules();
  const mapDate = App.state.mapDate || todayBrasil();
  if (!isWorkingDay(schedules, draggedEmpId, mapDate)) {
    showToast('Funcionário está de férias e não pode ser alocado.', 'warning');
    draggedEmpId = null;
    isDragging = false;
    return;
  }
  await addEmployeeToArea(draggedEmpId, areaId);
  draggedEmpId = null;
  isDragging = false;
}

async function addEmployeeToArea(empId, areaId) {
  const targetDate = App.state.mapDate || todayBrasil();
  const schedules = await getCachedSchedules();
  if (!isWorkingDay(schedules, empId, targetDate)) {
    showToast('Funcionário está de férias e não pode ser alocado.', 'warning');
    return;
  }
  const existing = await getAllocationsAtDateAndArea(empId, targetDate);
  if (existing) {
    showToast('Funcionário já está alocado nesta data.', 'warning');
    return;
  }
  await db.insertAllocation({ id: uid(), employee_id: empId, area: areaId, allocated_at: targetDate + 'T00:00:00Z' });
  invalidateCache(['allocations']);
  renderMap();
  renderMapOverview();
  showToast('Funcionário alocado na área!', 'success');
}

async function allocSelectedToArea(areaId) {
  if (!selectedEmpId) return;
  const empId = selectedEmpId;
  selectedEmpId = null;
  await addEmployeeToArea(empId, areaId);
}

async function removeFromArea(empId) {
  const targetDate = App.state.mapDate || todayBrasil();
  await db.deleteAllocationsForDay(empId, targetDate);
  invalidateCache(['allocations']);
  renderMap();
  renderMapOverview();
  showToast('Funcionário removido da área.', 'info');
}

/* ============================================
   MAP EMPLOYEE DETAIL
   ============================================ */
async function getEmployeeSectorPerformance(empId, allocations, tasks) {
  if (!allocations) allocations = await getCachedAllocations();
  if (!tasks) tasks = await getCachedTasks();

  const empAllocs = allocations.filter(a => a.employee_id === empId && a.area !== null);
  const sectorPerf = {};
  empAllocs.forEach(a => {
    if (!sectorPerf[a.area]) sectorPerf[a.area] = { area: a.area, tasks: 0, completed: 0, overdue: 0 };
    const dateStr = a.allocated_at ? a.allocated_at.slice(0, 10) : '';
    const dayTasks = tasks.filter(t => t.assignee === empId && t.date === dateStr);
    dayTasks.forEach(t => {
      sectorPerf[a.area].tasks++;
      if (t.status === 'completed') sectorPerf[a.area].completed++;
      if (t.status !== 'completed' && t.date < todayBrasil()) sectorPerf[a.area].overdue++;
    });
  });
  const areas = Object.values(sectorPerf);
  areas.forEach(s => { s.rate = s.tasks > 0 ? Math.round(s.completed / s.tasks * 100) : 0; });
  areas.sort((a, b) => b.rate - a.rate);
  return areas;
}

async function showEmployeeMapDetail(empId) {
  const [emp, allocations, tasks, employees] = await Promise.all([
    db.getEmployee(empId), getCachedAllocations(), getCachedTasks(), getCachedEmployees()
  ]);
  if (!emp) return;

  const perf = await getEmployeePerformance(empId, tasks);
  const sectorPerf = await getEmployeeSectorPerformance(empId, allocations, tasks);
  const allocHistory = allocations.filter(a => a.employee_id === empId).sort((a, b) => (a.allocated_at || '').localeCompare(b.allocated_at || ''));
  const empTasks = tasks.filter(t => t.assignee === empId);
  const completedTasks = empTasks.filter(t => t.status === 'completed');
  const pendingTasks = empTasks.filter(t => t.status !== 'completed');
  const now = todayBrasil();
  const tomorrow = (() => { const d = new Date(now + 'T12:00:00'); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();
  const weekEnd = (() => { const d = new Date(now + 'T12:00:00'); d.setDate(d.getDate() + (8 - d.getDay())); return d.toISOString().slice(0, 10); })();

  const latestAlloc = [...allocHistory].reverse().find(a => a.area !== null);
  const currentAreaName = latestAlloc ? (areasList.find(a => a.id === latestAlloc.area)?.name || latestAlloc.area) : 'Não alocado';
  const areaOpts = areasList.map(a =>
    `<option value="${a.id}"${latestAlloc && latestAlloc.area === a.id ? ' selected' : ''}>${a.icon} ${a.name}</option>`
  ).join('');
  const taskOpts = tasks.filter(t => t.assignee !== empId && t.status !== 'completed').map(t =>
    `<option value="${t.id}">${t.title} (${t.date})</option>`
  ).join('');

  const bestSector = sectorPerf.length > 0 ? sectorPerf[0] : null;

  const groups = { overdue: [], today: [], tomorrow: [], week: [], later: [] };
  pendingTasks.forEach(t => {
    if (t.date < now) groups.overdue.push(t);
    else if (t.date === now) groups.today.push(t);
    else if (t.date === tomorrow) groups.tomorrow.push(t);
    else if (t.date <= weekEnd) groups.week.push(t);
    else groups.later.push(t);
  });
  const groupLabels = {
    overdue: { icon: '🔴', label: 'Atrasadas' }, today: { icon: '📅', label: 'Hoje' },
    tomorrow: { icon: '📅', label: 'Amanha' }, week: { icon: '📅', label: 'Esta Semana' },
    later: { icon: '📅', label: 'Proximos' },
  };
  const groupOrder = ['overdue', 'today', 'tomorrow', 'week', 'later'];

  function renderTaskGroup(key) {
    const items = groups[key];
    if (items.length === 0) return '';
    const g = groupLabels[key];
    return `<div class="md-task-group">
      <div class="md-task-group-header" style="${key === 'overdue' ? 'background:rgba(239,68,68,.12);color:var(--red)' : ''}">
        <span>${g.icon} ${g.label}</span>
        <span class="group-count">${items.length} tarefa${items.length > 1 ? 's' : ''}</span>
      </div>
      ${items.slice(0, key === 'overdue' ? 10 : 5).map(t =>
        `<div class="md-task-row${key === 'overdue' ? ' overdue' : ''}">
          <span>${t.title}</span>
          <span class="md-date">${t.date} ${t.time || ''}</span>
        </div>`
      ).join('')}
      ${items.length > (key === 'overdue' ? 10 : 5) ? `<div style="font-size:.7rem;color:var(--text-muted);padding:.15rem .5rem">+${items.length - (key === 'overdue' ? 10 : 5)} mais</div>` : ''}
    </div>`;
  }

  let html = `
    <div class="map-detail-grid">
      <div class="map-detail-left">
        <div class="md-header">
          <div class="md-avatar" style="background:${randomColor(emp.name)}">${getInitials(emp.name)}</div>
          <div>
            <h3>${emp.name}</h3>
            <span class="md-role">${emp.role}</span>
            <span class="md-status">📍 ${currentAreaName}</span>
          </div>
        </div>
        <div class="md-perf-row">
          <div class="md-perf-item"><span class="md-perf-num" style="color:${perfColor(perf.rate)}">${perf.rate}%</span><span>Conclusão</span></div>
          <div class="md-perf-item"><span class="md-perf-num">${perf.total}</span><span>Tarefas</span></div>
          <div class="md-perf-item"><span class="md-perf-num" style="color:var(--green)">${perf.completed}</span><span>Feitas</span></div>
          <div class="md-perf-item"><span class="md-perf-num" style="color:var(--amber)">${pendingTasks.length}</span><span>Pendentes</span></div>
          <div class="md-perf-item"><span class="md-perf-num" style="color:var(--red)">${perf.overdue}</span><span>Atrasadas</span></div>
        </div>
        <div class="md-section">
          <h4>📊 Performance por Setor</h4>
          ${sectorPerf.length === 0 ? '<p style="color:var(--text-muted)">Nenhum dado por setor ainda.</p>' :
            sectorPerf.map(s => {
              const area = areasList.find(a => a.id === s.area);
              return `<div class="md-sector-row${bestSector && s.area === bestSector.area ? ' best' : ''}">
                <span>${area ? area.icon + ' ' + area.name : s.area}</span>
                <span class="md-sector-rate" style="color:${perfColor(s.rate)}">${s.rate}%</span>
                <span>${s.completed}/${s.tasks} tarefas</span>
              </div>`;
            }).join('')
          }
        </div>
        <div class="md-section">
          <h4>📋 Ultimas Alocacoes</h4>
          ${allocHistory.length === 0 ? '<p style="color:var(--text-muted)">Nenhum histórico.</p>' :
            [...allocHistory].reverse().slice(0, 5).map(a => {
              const area = areasList.find(x => x.id === a.area);
              const label = a.area ? (area ? area.name : a.area) : 'Removido';
              return `<div class="md-alloc-row">
                <span>${label}</span>
                <span class="md-date">${a.allocated_at ? new Date(a.allocated_at).toLocaleString('pt-BR') : ''}</span>
              </div>`;
            }).join('')
          }
        </div>
      </div>
      <div class="map-detail-right">
        <div class="md-section">
          <h4>✅ Tarefas Concluidas (${completedTasks.length})</h4>
          ${completedTasks.length === 0 ? '<p style="color:var(--text-muted)">Nenhuma tarefa concluída.</p>' :
            completedTasks.slice(0, 5).map(t => `<div class="md-task-row completed">${t.title}</div>`).join('')
          }
        </div>
        <div class="md-section">
          <h4>⏳ Pendentes por Periodo</h4>
          ${pendingTasks.length === 0 ? '<p style="color:var(--text-muted)">Nenhuma tarefa pendente.</p>' :
            groupOrder.map(k => renderTaskGroup(k)).join('')
          }
        </div>
      </div>
    </div>`;

  if (isGestor()) {
    html += `
      <div class="md-actions">
        <div class="md-action-group">
          <label>Alocar em Setor</label>
          <div class="md-action-row">
            <select id="md-alloc-area" class="form-input">${areaOpts}</select>
            <button class="btn btn-sm btn-primary" onclick="allocFromDetail(${empId})">Alocar</button>
          </div>
        </div>
        <div class="md-action-group">
          <label>Atribuir Tarefa</label>
          <div class="md-action-row">
            <select id="md-assign-task" class="form-input">
              <option value="">Selecione...</option>
              ${taskOpts}
            </select>
            <button class="btn btn-sm btn-primary" onclick="assignTaskFromDetail(${empId})">Atribuir</button>
          </div>
        </div>
      </div>`;
  }

  document.getElementById('modal-title').textContent = emp.name;
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-overlay').style.display = 'flex';
  document.getElementById('modal-container').classList.add('large');
}

async function allocFromDetail(empId) {
  const area = document.getElementById('md-alloc-area').value;
  if (!area) return;
  await addEmployeeToArea(empId, area);
  closeModal();
}

async function assignTaskFromDetail(empId) {
  const taskId = parseInt(document.getElementById('md-assign-task').value);
  if (!taskId) return;
  await db.updateTask(taskId, { assignee: empId });
  invalidateCache('tasks');
  const emp = await db.getEmployee(empId);
  const task = await db.getTask(taskId);
  showToast(`Tarefa "${task.title}" atribuída a ${emp ? emp.name : 'funcionário'}!`, 'success');
  renderMap();
  closeModal();
}

/* ============================================
   MAP AREA DETAIL
   ============================================ */
async function showAreaMapDetail(areaId) {
  const area = areasList.find(a => a.id === areaId);
  if (!area) return;

  const [allocations, employees, tasks] = await Promise.all([getCachedAllocations(), getCachedEmployees(), getCachedTasks()]);
  const allocationsAtDate = getAllocationsAtDate(allocations, App.state.mapDate || todayBrasil());
  const areaAllocs = allocationsAtDate.filter(a => a.area === area.id);
  const count = areaAllocs.length;
  const capStatus = count > area.maxCapacity ? 'overload' : count >= area.maxCapacity ? 'attention' : 'normal';
  const areaPerf = await getAreaPerformance(area.id, allocations, employees, tasks);
  const goal = sectorGoals[area.id];
  const employeesInArea = areaAllocs.map(a => employees.find(e => e.id === a.employee_id)).filter(Boolean);
  const empIds = employeesInArea.map(e => e.id);
  const areaTasks = tasks.filter(t => empIds.includes(t.assignee));
  const now = todayBrasil();

  const empCards = employeesInArea.map(emp => {
    return `<div class="md-emp-row" onclick="showEmployeeMapDetail(${emp.id})" style="cursor:pointer">
      <span class="md-avatar-sm" style="background:${randomColor(emp.name)}">${getInitials(emp.name)}</span>
      <span>${emp.name}</span>
      <span>${areaTasks.filter(t => t.assignee === emp.id).length} tarefas</span>
    </div>`;
  }).join('');

  const taskRows = areaTasks.length > 0 ? areaTasks.slice(0, 10).map(t =>
    `<div class="md-task-row${t.status === 'completed' ? ' completed' : (t.date < now ? ' overdue' : '')}">
      <span>${t.title}</span>
      <span class="md-date">${t.date}</span>
    </div>`
  ).join('') : '<p style="color:var(--text-muted)">Nenhuma tarefa para este setor.</p>';

  const html = `
    <div class="md-area-detail">
      <div class="md-header">
        <div class="md-avatar area" style="background:var(--bg-card);font-size:2rem">${area.icon}</div>
        <div>
          <h3>${area.name}</h3>
          <span class="md-status">${count}/${area.maxCapacity} pessoas</span>
          <span class="area-status-dot ${capStatus}" style="display:inline-block;margin-left:.5rem"></span>
          <span style="font-size:.8rem;color:var(--text-muted)">${capStatus === 'normal' ? 'OK' : capStatus === 'attention' ? 'Capacidade máxima' : 'Lotado'}</span>
        </div>
      </div>
      <div class="md-perf-row">
        <div class="md-perf-item"><span class="md-perf-num" style="color:${perfColor(areaPerf.completionRate)}">${areaPerf.completionRate}%</span><span>Conclusão</span></div>
        <div class="md-perf-item"><span class="md-perf-num">${areaPerf.totalTasks}</span><span>Tarefas</span></div>
        <div class="md-perf-item"><span class="md-perf-num" style="color:var(--green)">${areaPerf.completedTasks}</span><span>Concluídas</span></div>
        <div class="md-perf-item"><span class="md-perf-num" style="color:var(--red)">${areaPerf.overdueTasks}</span><span>Atrasadas</span></div>
        <div class="md-perf-item"><span class="md-perf-num">${areaPerf.employeeCount}</span><span>Funcionários</span></div>
      </div>
      <div class="md-section">
        <h4>🎯 Meta do Setor</h4>
        <div class="md-goal-card">
          <div><strong>${goal.goal}</strong></div>
          <div style="color:var(--text-muted);font-size:.85rem">${goal.target}</div>
          <div class="area-goal-bar" style="margin-top:.5rem">
            <div class="progress-bar"><div class="progress-fill ${areaPerf.completionRate >= 80 ? 'green' : areaPerf.completionRate >= 50 ? 'amber' : 'red'}" style="width:${areaPerf.completionRate}%"></div></div>
            <span class="area-goal-pct" style="color:${perfColor(areaPerf.completionRate)}">${areaPerf.completionRate}%</span>
          </div>
        </div>
      </div>
      <div class="md-section">
        <h4>👥 Funcionarios no Setor (${employeesInArea.length})</h4>
        ${employeesInArea.length === 0 ? '<p style="color:var(--text-muted)">Nenhum funcionário alocado.</p>' : empCards}
      </div>
      <div class="md-section">
        <h4>📋 Tarefas do Setor (${areaTasks.length})</h4>
        ${taskRows}
      </div>
    </div>`;

  document.getElementById('modal-title').textContent = area.name;
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-overlay').style.display = 'flex';
}

/* ============================================
   INLINE TASKS MODAL (reports, team, etc.)
   ============================================ */
async function showEmployeeTasks(empId, statusFilter) {
  const [tasks, employees] = await Promise.all([getCachedTasks(), getCachedEmployees()]);
  const emp = employees.find(e => e.id === empId);
  if (!emp) return;

  let empTasks = tasks.filter(t => t.assignee === empId);
  if (statusFilter === 'pending') {
    empTasks = empTasks.filter(t => t.status !== 'completed');
  } else if (statusFilter) {
    empTasks = empTasks.filter(t => t.status === statusFilter);
  }

  empTasks.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  const now = todayBrasil();
  const total = empTasks.length;
  const done = empTasks.filter(t => t.status === 'completed').length;
  const nPending = empTasks.filter(t => t.status !== 'completed').length;

  const taskRows = empTasks.slice(0, 20).map(t => {
    const overdue = t.status !== 'completed' && t.date < now;
    return `<div class="md-task-row ${t.status === 'completed' ? 'completed' : overdue ? 'overdue' : ''}" style="cursor:pointer" onclick="closeModal();showTaskDetail(${t.id})">
      <span class="md-date" style="min-width:80px">${formatDate(t.date)}</span>
      <span style="flex:1">${t.title}</span>
      <span class="task-status-badge" style="background:${overdue ? 'var(--red)' : t.status === 'completed' ? 'var(--green)' : t.status === 'in_progress' ? 'var(--blue)' : 'var(--amber)'};font-size:.6rem;padding:2px 8px">${overdue ? 'Atrasada' : statusLabel(t.status)}</span>
    </div>`;
  }).join('');

  openModal(`📋 Tarefas: ${emp.name}`, `
    <div style="font-size:.82rem;color:var(--text-muted);margin-bottom:.75rem">${total} tarefas • ${done} concluídas • ${nPending} pendentes</div>
    <div style="max-height:50vh;overflow-y:auto">
      ${taskRows || '<div style="color:var(--text-muted);text-align:center;padding:1rem">Nenhuma tarefa encontrada.</div>'}
    </div>
    <div class="form-row" style="margin-top:.75rem">
      <button class="btn btn-secondary" onclick="closeModal()">Fechar</button>
    </div>
  `, { large: true });
}

async function showAreaTasks(areaId) {
  const [tasks, employees, allocations] = await Promise.all([getCachedTasks(), getCachedEmployees(), getCachedAllocations()]);
  const area = areasList.find(a => a.id === areaId);
  if (!area) return;
  const areaAllocs = allocations.filter(a => a.area === areaId);
  const empIds = areaAllocs.map(a => a.employee_id);
  const areaTasks = tasks.filter(t => empIds.includes(t.assignee)).sort((a, b) => a.date.localeCompare(b.date));
  const now = todayBrasil();
  const total = areaTasks.length;
  const done = areaTasks.filter(t => t.status === 'completed').length;
  const nOverdue = areaTasks.filter(t => t.status !== 'completed' && t.date < now).length;

  const taskRows = areaTasks.slice(0, 20).map(t => {
    const overdue = t.status !== 'completed' && t.date < now;
    const emp = employees.find(e => e.id === t.assignee);
    return `<div class="md-task-row ${t.status === 'completed' ? 'completed' : overdue ? 'overdue' : ''}" style="cursor:pointer" onclick="closeModal();showTaskDetail(${t.id})">
      <span class="md-date" style="min-width:80px">${formatDate(t.date)}</span>
      <span style="flex:1">${t.title}</span>
      <span style="font-size:.72rem;color:var(--text-muted);min-width:90px">👤 ${emp ? emp.name.split(' ')[0] : '—'}</span>
      <span class="task-status-badge" style="background:${overdue ? 'var(--red)' : t.status === 'completed' ? 'var(--green)' : t.status === 'in_progress' ? 'var(--blue)' : 'var(--amber)'};font-size:.6rem;padding:2px 8px">${overdue ? 'Atrasada' : statusLabel(t.status)}</span>
    </div>`;
  }).join('');

  openModal(`📋 Tarefas: ${area.name}`, `
    <div style="font-size:.82rem;color:var(--text-muted);margin-bottom:.75rem">${total} tarefas • ${done} concluídas • ${nOverdue} atrasadas</div>
    <div style="max-height:50vh;overflow-y:auto">
      ${taskRows || '<div style="color:var(--text-muted);text-align:center;padding:1rem">Nenhuma tarefa neste setor.</div>'}
    </div>
    <div class="form-row" style="margin-top:.75rem">
      <button class="btn btn-secondary" onclick="closeModal()">Fechar</button>
    </div>
  `, { large: true });
}

/* ============================================
   MAP OVERVIEW
   ============================================ */
function initMapDateNav() {
  const input = document.getElementById('map-date-input');
  if (!input) return;
  input.value = App.state.mapDate || todayBrasil();

  input.addEventListener('change', () => {
    App.state.mapDate = input.value;
    App.state.mapOverviewPeriod = 'custom';
    App.state.ovCustomStart = input.value;
    App.state.ovCustomEnd = input.value;
    renderMap();
    renderMapOverview();
  });

  document.getElementById('map-date-prev')?.addEventListener('click', () => {
    const d = new Date(input.value || new Date());
    d.setDate(d.getDate() - 1);
    input.value = d.toISOString().slice(0, 10);
    App.state.mapDate = input.value;
    App.state.mapOverviewPeriod = 'custom';
    App.state.ovCustomStart = input.value;
    App.state.ovCustomEnd = input.value;
    renderMap();
    renderMapOverview();
  });

  document.getElementById('map-date-next')?.addEventListener('click', () => {
    const d = new Date(input.value || new Date());
    d.setDate(d.getDate() + 1);
    input.value = d.toISOString().slice(0, 10);
    App.state.mapDate = input.value;
    App.state.mapOverviewPeriod = 'custom';
    App.state.ovCustomStart = input.value;
    App.state.ovCustomEnd = input.value;
    renderMap();
    renderMapOverview();
  });

  document.getElementById('map-date-today')?.addEventListener('click', () => {
    const today = todayBrasil();
    input.value = today;
    App.state.mapDate = today;
    App.state.mapOverviewPeriod = 'today';
    App.state.ovCustomStart = '';
    App.state.ovCustomEnd = '';
    renderMap();
    renderMapOverview();
  });
}

function initMapTabEvents() {
  document.querySelectorAll('.map-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.map-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.maptab;
      document.getElementById('map-overview').style.display = target === 'overview' ? 'block' : 'none';
      document.getElementById('map-allocation').style.display = target === 'allocation' ? 'block' : 'none';
    });
  });
}

async function renderMapOverview() {
  const container = document.getElementById('map-overview');
  if (!container) return;

  const range = getDateRange(App.state.mapOverviewPeriod || 'today');
  const { start, end } = range;

  const [employees, allAllocs, allTasks, allMeetings, allSchedules] = await Promise.all([
    getCachedEmployees(), getCachedAllocations(), getCachedTasks(), getCachedMeetings(), getCachedSchedules()
  ]);

  // Build day-by-day allocation state for the entire period
  const daysInPeriod = Math.max(1, Math.round((new Date(end) - new Date(start)) / 864e5) + 1);
  const dayList = [];
  const cursor = new Date(start + 'T12:00:00');
  for (let i = 0; i < daysInPeriod; i++) {
    dayList.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  // For each day, compute who is allocated (state at that day)
  const dayAllocMap = {}; // dayStr -> Set of employee_ids
  dayList.forEach(d => {
    dayAllocMap[d] = new Set(getAllocationsAtDate(allAllocs, d).map(a => a.employee_id));
  });

  // State at end-of-period (matches what renderMap shows for that date)
  const endStateSet = dayAllocMap[end] || new Set();

  // Events that occurred within the period
  const periodAllocs = allAllocs.filter(a => {
    const ad = a.allocated_at ? a.allocated_at.slice(0, 10) : '';
    return ad >= start && ad <= end;
  });

  const eventSet = new Set();
  periodAllocs.forEach(a => {
    const d = a.allocated_at ? a.allocated_at.slice(0, 10) : '';
    if (a.area) eventSet.add(`${a.employee_id}_${d}_${a.area}`);
  });
  const totalEvents = eventSet.size;

  const totalEscalados = endStateSet.size;
  const totalEscalas = periodAllocs.filter(a => a.area !== null).length;

  const periodTasks = allTasks.filter(t => t.date >= start && t.date <= end);
  const participants = await getCachedParticipants();
  const periodMeetings = allMeetings.filter(m => m.date >= start && m.date <= end);

  const horasPrevistas = periodTasks.length + periodMeetings.reduce((s, m) => {
    const mp = participants.filter(p => p.meeting_id === m.id && p.status === 'confirmed');
    return s + mp.length * (m.duration || 60) / 60;
  }, 0);

  const completedTasks = periodTasks.filter(t => t.status === 'completed');
  const confirmedHours = periodMeetings.reduce((s, m) => {
    const mp = participants.filter(p => p.meeting_id === m.id && p.status === 'confirmed');
    return s + mp.length * (m.duration || 60) / 60;
  }, 0);
  const horasConcluidas = completedTasks.length + confirmedHours;

  const disponiveis = employees.filter(e => e.status === 'free').length;
  const emServico = employees.filter(e => e.status === 'task' || e.status === 'busy').length;
  const semEscala = employees.filter(e => !endStateSet.has(e.id)).length;
  const emFerias = employees.filter(e => {
    const s = allSchedules.find(s => s.employee_id === e.id && s.start_date <= end && s.end_date >= start && s.type === 'vacation');
    return !!s;
  }).length;

  // Occupancy: sum of allocated employees across all days / max possible
  let totalDiasTrab = 0;
  dayList.forEach(d => { totalDiasTrab += dayAllocMap[d].size; });
  const maxPossibleDays = employees.length * daysInPeriod;
  const taxaOcupacao = maxPossibleDays > 0 ? Math.round(totalDiasTrab / maxPossibleDays * 100) : 0;

  const mediaColab = totalEvents > 0 ? (totalEscalas / totalEvents).toFixed(1) : '0';

  const collabRows = employees.map(emp => {
    const ea = periodAllocs.filter(a => a.employee_id === emp.id && a.area !== null);
    const eventos = ea.length;
    let diasTrab = 0;
    dayList.forEach(d => { if (dayAllocMap[d].has(emp.id)) diasTrab++; });
    const diasSem = daysInPeriod - diasTrab;
    const ocup = daysInPeriod > 0 ? Math.round(diasTrab / daysInPeriod * 100) : 0;
    const ativo = endStateSet.has(emp.id);
    const onVacation = allSchedules.some(s => s.employee_id === emp.id && s.start_date <= end && s.end_date >= start && s.type === 'vacation');
    return { emp, eventos, ocupacao: ocup, diasSemEscala: diasSem, ativo, onVacation };
  });

  const pKey = App.state.mapOverviewPeriod || 'today';
  const periodos = [
    { k: 'today', l: 'Hoje' }, { k: 'tomorrow', l: 'Amanhã' },
    { k: 'week', l: 'Esta Semana' }, { k: 'nextWeek', l: 'Próx. Semana' },
    { k: 'month', l: 'Este Mês' }, { k: 'nextMonth', l: 'Próx. Mês' },
    { k: 'last7', l: 'Últ. 7 Dias' }, { k: 'last30', l: 'Últ. 30 Dias' },
    { k: 'custom', l: 'Personalizado' },
  ];
  const pc = v => v >= 80 ? '#10b981' : v >= 50 ? '#f59e0b' : '#ef4444';

  container.innerHTML = `
    <div class="card map-overview">
      <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem">
        <h3>📊 Visao Geral</h3>
        <div class="period-selector" style="flex-wrap:wrap">
          ${periodos.map(p => `<button class="period-btn ${pKey === p.k ? 'active' : ''}" data-ovp="${p.k}">${p.l}</button>`).join('')}
          <div class="period-custom${pKey === 'custom' ? ' show' : ''}" id="ov-custom">
            <input type="date" id="ov-start" value="${App.state.ovCustomStart || ''}">
            <span>até</span>
            <input type="date" id="ov-end" value="${App.state.ovCustomEnd || ''}">
          </div>
      </div>
      </div>
      <div class="card-body">
        <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:.75rem">📅 ${start === end ? formatDate(start) : formatDate(start) + ' a ' + formatDate(end)}</div>
        <div class="overview-metrics">
          <div class="metric-card"><div class="metric-value" style="color:var(--blue)">${totalEvents}</div><div class="metric-label">Eventos</div></div>
          <div class="metric-card"><div class="metric-value" style="color:var(--green)">${totalEscalados}</div><div class="metric-label">Colab. Escalados</div></div>
          <div class="metric-card"><div class="metric-value" style="color:var(--amber)">${totalEscalas}</div><div class="metric-label">Escalas Criadas</div></div>
          <div class="metric-card"><div class="metric-value">${Math.round(horasPrevistas)}h</div><div class="metric-label">Horas Previstas</div></div>
          <div class="metric-card"><div class="metric-value" style="color:var(--green)">${Math.round(horasConcluidas)}h</div><div class="metric-label">Horas Concluídas</div></div>
          <div class="metric-card"><div class="metric-value" style="color:var(--blue)">${disponiveis}</div><div class="metric-label">Disponíveis</div></div>
          <div class="metric-card"><div class="metric-value" style="color:var(--amber)">${emServico}</div><div class="metric-label">Em Serviço</div></div>
          <div class="metric-card"><div class="metric-value" style="color:var(--red)">${semEscala}</div><div class="metric-label">Sem Escala</div></div>
          <div class="metric-card"><div class="metric-value" style="color:var(--purple)">${emFerias}</div><div class="metric-label">De Férias</div></div>
          <div class="metric-card"><div class="metric-value" style="color:${pc(taxaOcupacao)}">${taxaOcupacao}%</div><div class="metric-label">Ocupação</div></div>
          <div class="metric-card"><div class="metric-value">${mediaColab}</div><div class="metric-label">Média p/ Evento</div></div>
        </div>
        <h4 style="font-size:.85rem;margin:0 0 .5rem 0;color:var(--text-secondary);margin-top:1rem">👤 Resumo por Colaborador</h4>
        <div style="overflow-x:auto">
          <table class="overview-collab-table">
            <thead><tr>
              <th>Colaborador</th><th>Eventos</th><th>Dias sem escala</th><th>Ocupação</th><th>Status</th>
            </tr></thead>
            <tbody>
              ${collabRows.map(r => `<tr>
                <td><div class="collab-info"><span class="collab-avatar" style="background:${randomColor(r.emp.name)}">${getInitials(r.emp.name)}</span>${r.emp.name}</div></td>
                <td>${r.eventos}</td>
                <td style="color:${r.diasSemEscala > 0 ? 'var(--red)' : 'var(--text-muted)'}">${r.diasSemEscala}</td>
                <td style="color:${pc(r.ocupacao)}">${r.ocupacao}%</td>
                <td><span class="status-badge ${r.onVacation ? 'vacation' : r.ativo ? 'allocated' : 'pool'}">${r.onVacation ? '🏖️ Ferias' : r.ativo ? 'Alocado' : 'Sem Escala'}</span></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;

  container.querySelectorAll('[data-ovp]').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.ovp;
      App.state.mapOverviewPeriod = k;
      if (k !== 'custom') { App.state.ovCustomStart = ''; App.state.ovCustomEnd = ''; }
      renderMapOverview();
      syncMapDateWithOverviewPeriod();
    });
  });

  if (pKey === 'custom') {
    const si = document.getElementById('ov-start');
    const ei = document.getElementById('ov-end');
    if (si && ei) {
      si.addEventListener('change', () => { App.state.ovCustomStart = si.value; renderMapOverview(); syncMapDateWithOverviewPeriod(); });
      ei.addEventListener('change', () => { App.state.ovCustomEnd = ei.value; renderMapOverview(); syncMapDateWithOverviewPeriod(); });
    }
  }
}

function syncMapDateWithOverviewPeriod() {
  const range = getDateRange(App.state.mapOverviewPeriod || 'today');
  const input = document.getElementById('map-date-input');
  if (input) {
    input.value = range.end;
    App.state.mapDate = range.end;
    renderMap();
  }
}

/* ============================================
   CENTRO DE CONTROLE OPERACIONAL
   ============================================ */
async function renderOperations() {
  const content = document.getElementById('operations-content');
  content.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-muted)">Carregando...</div>`;
  document.getElementById('ops-timestamp').textContent = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  // Setup period filter events
  const sel = document.getElementById('ops-period-selector');
  if (sel) {
    sel.querySelectorAll('[data-opsd]').forEach(btn => {
      btn.addEventListener('click', () => {
        sel.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const k = btn.dataset.opsd;
        document.getElementById('ops-custom').classList.toggle('show', k === 'custom');
        refreshOperations();
      });
    });
    document.getElementById('ops-date-start')?.addEventListener('change', refreshOperations);
    document.getElementById('ops-date-end')?.addEventListener('change', refreshOperations);
  }

  await refreshOperations();
}

function getOpsDateRange() {
  const active = document.querySelector('#ops-period-selector .period-btn.active');
  const key = active ? active.dataset.opsd : 'today';
  if (key === 'custom') {
    const s = document.getElementById('ops-date-start')?.value;
    const e = document.getElementById('ops-date-end')?.value;
    return { start: s || todayBrasil(), end: e || todayBrasil(), key };
  }
  const range = getDateRange(key);
  return { start: range.start, end: range.end, key };
}

async function refreshOperations() {
  const content = document.getElementById('operations-content');
  const [employees, tasks, sectors, allocations] = await Promise.all([
    getCachedEmployees(),
    getCachedTasks(),
    db.getSectors(),
    getCachedAllocations(),
  ]);

  const today = todayBrasil();
  const { start, end } = getOpsDateRange();
  const isToday = start === today && end === today;
  const periodTasks = tasks.filter(t => t.date >= start && t.date <= end);
  const overdue = periodTasks.filter(t => t.status !== 'completed' && t.date < today);
  const completedPeriod = periodTasks.filter(t => t.status === 'completed');
  const pendingPeriod = periodTasks.filter(t => t.status !== 'completed' && t.date >= start);

  const areaProd = (sectors || []).map(s => {
    const st = tasks.filter(t => allocations.some(a => a.area === s.name && a.employee_id === t.assignee));
    return { name: s.name, icon: s.icon, total: st.length, done: st.filter(t => t.status === 'completed').length, goal: s.goal || 0 };
  });

  const rangeLabel = start === end ? formatDate(start) : formatDate(start) + ' — ' + formatDate(end);
  const futureTasks = tasks.filter(t => t.status !== 'completed' && t.date >= today).slice(0, 10);

  content.innerHTML = `
    <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:.75rem">${rangeLabel}</div>
    <div class="ops-metrics-grid">
      <div class="ops-card ${overdue.length ? 'red' : 'green'}">
        <svg class="ops-card-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12"/><line x1="12" y1="12" x2="16" y2="12"/></svg>
        <div class="ops-card-value">${overdue.length}</div>
        <div class="ops-card-label">Atrasadas</div>
      </div>
      <div class="ops-card blue">
        <svg class="ops-card-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        <div class="ops-card-value">${completedPeriod.length}</div>
        <div class="ops-card-label">${isToday ? 'Concluídas Hoje' : 'Concluídas'}</div>
      </div>
      <div class="ops-card amber">
        <svg class="ops-card-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        <div class="ops-card-value">${pendingPeriod.length}</div>
        <div class="ops-card-label">Pendentes</div>
      </div>
      <div class="ops-card purple">
        <svg class="ops-card-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
        <div class="ops-card-value">${employees.length}</div>
        <div class="ops-card-label">Total Equipe</div>
      </div>
    </div>

    <div class="ops-grid-2">
      <div class="card">
        <div class="card-header"><h3>Produtividade por Área</h3></div>
        <div class="card-body" style="max-height:300px;overflow-y:auto">
          ${areaProd.length ? areaProd.map(a => {
            const pct = a.total ? Math.round(a.done / a.total * 100) : 0;
            const bg = a.goal > 0 && pct < a.goal ? 'var(--red)' : pct < 30 ? 'var(--red)' : pct < 60 ? 'var(--amber)' : 'var(--green)';
            return `<div class="ops-area-row"><span>${a.name}</span><div class="ops-bar"><div class="ops-bar-fill" style="width:${Math.min(pct,100)}%;background:${bg}"></div></div><span style="font-size:.78rem;color:var(--text-muted)">${a.done}/${a.total}</span></div>`;
          }).join('') : '<div class="ops-empty">Nenhuma área cadastrada</div>'}
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Tarefas por Funcionário</h3></div>
        <div class="card-body" style="max-height:300px;overflow-y:auto">
          ${employees.length ? employees.map(e => {
            const et = periodTasks.filter(t => t.assignee === e.id);
            const done = et.filter(t => t.status === 'completed').length;
            if (!et.length) return '';
            return `<div class="ops-worker-row"><div class="emp-avatar-sm" style="background:${randomColor(e.name)}">${getInitials(e.name)}</div><span>${e.name}</span><span style="font-size:.78rem;color:var(--text-muted);margin-left:auto">${done}/${et.length}</span></div>`;
          }).filter(Boolean).join('') : '<div class="ops-empty">Nenhum funcionário</div>'}
        </div>
      </div>
    </div>

    <div class="ops-grid-2" style="margin-top:1rem">
      <div class="card">
        <div class="card-header"><h3>Tarefas Vencidas</h3></div>
        <div class="card-body" style="max-height:300px;overflow-y:auto">
          ${overdue.length ? overdue.slice(0, 10).map(t => `<div class="ops-task-row" onclick="showTaskDetail(${t.id})"><span class="ops-task-title">${t.title}</span><span style="font-size:.75rem;color:var(--text-muted)">${getEmployeeName(t.assignee, employees)}</span><span style="font-size:.7rem;color:var(--red);font-weight:600">${t.date}</span></div>`).join('') : '<div class="ops-empty">Nenhuma tarefa atrasada</div>'}
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Próximas Entregas</h3></div>
        <div class="card-body" style="max-height:300px;overflow-y:auto">
          ${futureTasks.length ? futureTasks.map(t => `<div class="ops-task-row" onclick="showTaskDetail(${t.id})"><span class="ops-task-title">${t.title}</span><span style="font-size:.75rem;color:var(--text-muted)">${getEmployeeName(t.assignee, employees)}</span><span style="font-size:.7rem;color:var(--blue);font-weight:600">${formatDate(t.date)}</span></div>`).join('') : '<div class="ops-empty">Nenhuma entrega programada</div>'}
        </div>
      </div>
    </div>
  `;
}

/* ============================================
   METAS E KPIs
   ============================================ */
async function renderGoals() {
  const content = document.getElementById('goals-content');
  content.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-muted)">Carregando...</div>`;

  const [goals, employees, sectors, tasks] = await Promise.all([
    db.getGoals(),
    getCachedEmployees(),
    db.getSectors(),
    getCachedTasks(),
  ]);

  const typeNames = { company: 'Empresa', sector: 'Setor', employee: 'Colaborador' };
  const metricNames = { tasks_completed: 'Tarefas Concluídas', manual: 'Personalizada' };

  // Auto-calcular progresso de tarefas concluídas
  const goalsWithProgress = goals.map(g => {
    if (g.metric === 'tasks_completed') {
      let filtered = tasks.filter(t => t.status === 'completed' && t.date >= g.period_start && t.date <= g.period_end);
      if (g.type === 'employee') filtered = filtered.filter(t => t.assignee === g.target_id);
      g.current_value = filtered.length;
    }
    return g;
  });

  content.innerHTML = `
    <div class="goals-filters" style="display:flex;gap:.5rem;margin-bottom:1rem;flex-wrap:wrap">
      <select id="goals-filter-type" onchange="renderGoals()" style="padding:.35rem .6rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-card);color:var(--text)">
        <option value="">Todos os Tipos</option>
        <option value="company">Empresa</option>
        <option value="sector">Setor</option>
        <option value="employee">Colaborador</option>
      </select>
      <select id="goals-filter-metric" onchange="renderGoals()" style="padding:.35rem .6rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-card);color:var(--text)">
        <option value="">Todas as Métricas</option>
        <option value="tasks_completed">Tarefas Concluídas ⭐</option>
        <option value="manual">Personalizada</option>
      </select>
    </div>
    <div style="margin-bottom:1rem;font-size:.78rem;color:var(--text-muted)">💡 Metas de "Tarefas Concluídas" são calculadas automaticamente. O valor atual é atualizado em tempo real com base nas tarefas concluídas no período.</div>
    <div class="goals-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1rem">
      ${goalsWithProgress.length ? goalsWithProgress.filter(g => {
        const ft = document.getElementById('goals-filter-type')?.value;
        const fm = document.getElementById('goals-filter-metric')?.value;
        return (!ft || g.type === ft) && (!fm || g.metric === fm);
      }).map(g => {
        const pct = g.target_value > 0 ? Math.min(Math.round(g.current_value / g.target_value * 100), 100) : 0;
        const pctColor = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--amber)' : 'var(--red)';
        let targetLabel = typeNames[g.type] || g.type;
        if (g.type === 'sector') targetLabel += ': ' + (sectors.find(s => s.id === g.target_id)?.name || 'N/A');
        if (g.type === 'employee') targetLabel += ': ' + (employees.find(e => e.id === g.target_id)?.name || 'N/A');
        return `<div class="card">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
            <h3 style="font-size:.9rem">${g.label || metricNames[g.metric] || g.metric}</h3>
            <div style="display:flex;gap:.25rem">
              <button class="btn btn-sm btn-secondary" onclick="editGoal(${g.id})" title="Editar">✎</button>
              <button class="btn btn-sm btn-danger" onclick="deleteGoal(${g.id})" title="Excluir">✕</button>
            </div>
          </div>
          <div class="card-body">
            <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:.5rem">${targetLabel}</div>
            <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:.5rem">${formatDate(g.period_start)} — ${formatDate(g.period_end)}</div>
            <div style="font-size:1.5rem;font-weight:700;color:${pctColor}">${g.current_value} <span style="font-size:.8rem;color:var(--text-muted);font-weight:400">/ ${g.target_value} ${g.metric === 'tasks_completed' ? 'tarefas' : ''}</span></div>
            <div style="margin-top:.5rem;height:8px;background:var(--bg);border-radius:4px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${pctColor};border-radius:4px;transition:width .3s"></div>
            </div>
            <div style="margin-top:.25rem;font-size:.7rem;color:var(--text-muted);text-align:right">${pct}%</div>
          </div>
        </div>`;
      }).join('') : '<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--text-muted)">Nenhuma meta cadastrada. Clique em "+ Nova Meta" para começar.</div>'}
    </div>
  `;

  document.getElementById('btn-new-goal').onclick = () => showGoalModal();
}

function showGoalModal(goal) {
  const title = goal ? 'Editar Meta' : 'Nova Meta';
  const g = goal || { type: 'company', target_id: null, metric: 'tasks_completed', target_value: 1, current_value: 0, label: '', period_start: todayBrasil(), period_end: todayBrasil() };
  showModal(title, `
    <div class="form-group">
      <label>Tipo</label>
      <select id="goal-type" onchange="updateGoalTargets()" style="width:100%;padding:.5rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-card);color:var(--text)">
        <option value="company" ${g.type === 'company' ? 'selected' : ''}>Empresa</option>
        <option value="sector" ${g.type === 'sector' ? 'selected' : ''}>Setor</option>
        <option value="employee" ${g.type === 'employee' ? 'selected' : ''}>Colaborador</option>
      </select>
    </div>
    <div class="form-group" id="goal-target-group" style="display:${g.type === 'company' ? 'none' : 'block'}">
      <label>${g.type === 'sector' ? 'Setor' : 'Colaborador'}</label>
      <select id="goal-target-id" style="width:100%;padding:.5rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-card);color:var(--text)"></select>
    </div>
    <div class="form-group">
      <label>Métrica</label>
      <select id="goal-metric" onchange="toggleGoalCurrent()" style="width:100%;padding:.5rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-card);color:var(--text)">
        <option value="tasks_completed" ${g.metric === 'tasks_completed' ? 'selected' : ''}>Tarefas Concluídas (automático) ⭐</option>
        <option value="manual" ${g.metric === 'manual' ? 'selected' : ''}>Personalizada (manual)</option>
      </select>
    </div>
    <div class="form-group">
      <label>Nome Personalizado (opcional)</label>
      <input type="text" id="goal-label" value="${g.label}" placeholder="Ex: Meta de Tarefas Q1" style="width:100%;padding:.5rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-card);color:var(--text)">
    </div>
    <div class="form-group">
      <label>Valor Alvo</label>
      <input type="number" id="goal-target" value="${g.target_value}" min="1" style="width:100%;padding:.5rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-card);color:var(--text)">
    </div>
    <div class="form-group" id="goal-current-group" style="display:${g.metric === 'manual' ? 'block' : 'none'}">
      <label>Valor Atual (manual)</label>
      <input type="number" id="goal-current" value="${g.current_value}" min="0" style="width:100%;padding:.5rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-card);color:var(--text)">
      <div style="font-size:.75rem;color:var(--text-muted);margin-top:.25rem">Apenas para metas personalizadas. Para Tarefas Concluídas o valor é calculado automaticamente.</div>
    </div>
    <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem">
      <div class="form-group">
        <label>Início</label>
        <input type="date" id="goal-start" value="${g.period_start}" style="width:100%;padding:.5rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-card);color:var(--text)">
      </div>
      <div class="form-group">
        <label>Fim</label>
        <input type="date" id="goal-end" value="${g.period_end}" style="width:100%;padding:.5rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-card);color:var(--text)">
      </div>
    </div>
    <div style="margin-top:1rem;display:flex;gap:.5rem;justify-content:flex-end">
      <button class="btn btn-primary" onclick="saveGoal(${g.id || 'null'})">Salvar</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    </div>
  `);
  updateGoalTargets();
}

function toggleGoalCurrent() {
  const isManual = document.getElementById('goal-metric')?.value === 'manual';
  const group = document.getElementById('goal-current-group');
  if (group) group.style.display = isManual ? 'block' : 'none';
}

async function updateGoalTargets() {
  const type = document.getElementById('goal-type')?.value;
  const group = document.getElementById('goal-target-group');
  if (group) group.style.display = type === 'company' ? 'none' : 'block';
  const sel = document.getElementById('goal-target-id');
  if (!sel) return;
  const data = type === 'sector' ? await getCachedSectors() : await getCachedEmployees();
  sel.innerHTML = data.length ? data.map(d => `<option value="${d.id}">${d.name}</option>`).join('') : '<option value="">Nenhum encontrado</option>';
}

async function saveGoal(id) {
  const goalType = document.getElementById('goal-type').value;
  const metric = document.getElementById('goal-metric').value;
  const g = {
    type: goalType,
    target_id: goalType === 'company' ? null : parseInt(document.getElementById('goal-target-id').value) || null,
    metric,
    label: document.getElementById('goal-label').value.trim(),
    target_value: parseFloat(document.getElementById('goal-target').value) || 0,
    current_value: metric === 'manual' ? (parseFloat(document.getElementById('goal-current').value) || 0) : 0,
    period_start: document.getElementById('goal-start').value,
    period_end: document.getElementById('goal-end').value,
  };
  if (g.target_value <= 0) { showToast('Valor alvo deve ser maior que zero', 'error'); return; }
  try {
    if (id) { await db.updateGoal(id, g); showToast('Meta atualizada!', 'success'); }
    else { await db.insertGoal(g); showToast('Meta criada!', 'success'); }
    closeModal();
    renderGoals();
  } catch (e) { showToast('Erro ao salvar meta: ' + e.message, 'error'); }
}

async function editGoal(id) {
  const goals = await db.getGoals();
  const g = goals.find(x => x.id === id);
  if (g) showGoalModal(g);
}

async function deleteGoal(id) {
  if (!confirm('Excluir esta meta?')) return;
  await db.deleteGoal(id);
  showToast('Meta excluída!', 'success');
  renderGoals();
}

/* ============================================
   DOCUMENTOS DA EMPRESA
   ============================================ */
async function renderDocs() {
  const content = document.getElementById('docs-content');
  content.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-muted)">Carregando...</div>`;
  const [docs, employees] = await Promise.all([db.getCompanyDocs(), getCachedEmployees()]);
  const catFilter = document.getElementById('filter-doc-category')?.value || 'all';
  const catNames = { contrato: 'Contrato', procedimento: 'Procedimento', norma: 'Norma', treinamento: 'Treinamento', outros: 'Outros' };
  const filtered = catFilter === 'all' ? docs : docs.filter(d => d.category === catFilter);
  const grouped = {};
  (catFilter === 'all' ? Object.keys(catNames) : [catFilter]).forEach(c => { grouped[c] = filtered.filter(d => d.category === c); });
  content.innerHTML = Object.entries(grouped).filter(([,v]) => v.length).map(([cat, items]) => `
    <div class="card" style="margin-bottom:.75rem">
      <div class="card-header"><h3>${catNames[cat] || cat} (${items.length})</h3></div>
      <div class="card-body">
        ${items.map(d => {
          const emp = d.employee_id ? employees.find(e => e.id === d.employee_id) : null;
          return `
          <div class="ops-worker-row" style="justify-content:space-between;flex-wrap:wrap;gap:.35rem">
            <div style="display:flex;align-items:center;gap:.5rem;flex:1;min-width:0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.name}</span>
              ${emp ? `<span style="font-size:.7rem;color:var(--blue)">→ ${emp.name}</span>` : ''}
              ${d.signed_by ? `<span style="font-size:.7rem;color:var(--green)">✍️ ${d.signed_by}</span>` : ''}
            </div>
            <div style="display:flex;gap:.25rem;align-items:center;flex-shrink:0;flex-wrap:wrap">
              ${d.file_url ? `<button class="btn btn-sm btn-secondary" onclick="previewDoc('${d.file_url}','${d.name.replace(/'/g, "\\'")}')" style="font-size:.7rem;padding:.15rem .35rem" title="Visualizar">👁️</button>` : ''}
              ${d.file_url ? `<a href="${d.file_url}" target="_blank" class="btn btn-sm btn-secondary" style="font-size:.7rem;padding:.15rem .35rem;text-decoration:none" download>📥</a>` : ''}
              ${!d.signed_by ? `<button class="btn btn-sm btn-secondary" onclick="signDoc(${d.id})" style="font-size:.7rem;padding:.15rem .35rem" title="Assinar">✍️</button>` : ''}
              <span style="font-size:.7rem;color:var(--text-muted)">${(d.created_at || '').substring(0, 10)}</span>
              <button class="btn btn-sm btn-danger" onclick="deleteDoc(${d.id})" title="Excluir" style="font-size:.75rem;padding:.15rem .35rem">✕</button>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
  `).join('') || '<div class="ops-empty" style="margin-top:1rem;text-align:center;padding:2rem;color:var(--text-muted)">Nenhum documento encontrado. Clique em "+ Novo Documento" para adicionar.</div>';

  document.getElementById('btn-new-doc').onclick = () => showDocModal();
}

function previewDoc(url, name) {
  const isImage = /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(url);
  const isPdf = /\.pdf$/i.test(url);
  if (isImage) {
    openModal(name, `<div style="text-align:center"><img src="${url}" style="max-width:100%;max-height:80vh;border-radius:var(--radius-md)"></div>`);
  } else if (isPdf) {
    openModal(name, `<iframe src="${url}" style="width:100%;height:80vh;border:none;border-radius:var(--radius-md)"></iframe>`);
  } else {
    window.open(url, '_blank');
  }
}

function showDocModal(existingDoc) {
  const employeesPromise = getCachedEmployees();
  employeesPromise.then(employees => {
    openModal(existingDoc ? 'Editar Documento' : 'Novo Documento', `
      <div class="form-group">
        <label>Nome do Documento</label>
        <input type="text" id="doc-name" value="${existingDoc ? existingDoc.name : ''}" placeholder="Ex: Contrato de Prestação de Serviços" style="width:100%;padding:.5rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-card);color:var(--text)">
      </div>
      <div class="form-group">
        <label>Categoria</label>
        <select id="doc-category" style="width:100%;padding:.5rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-card);color:var(--text)">
          <option value="contrato" ${existingDoc?.category==='contrato'?'selected':''}>Contrato</option>
          <option value="procedimento" ${existingDoc?.category==='procedimento'?'selected':''}>Procedimento</option>
          <option value="norma" ${existingDoc?.category==='norma'?'selected':''}>Norma</option>
          <option value="treinamento" ${existingDoc?.category==='treinamento'?'selected':''}>Treinamento</option>
          <option value="outros" ${existingDoc?.category==='outros'?'selected':''}>Outros</option>
        </select>
      </div>
      <div class="form-group">
        <label>Atribuir a Funcionário (opcional)</label>
        <select id="doc-employee" style="width:100%;padding:.5rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-card);color:var(--text)">
          <option value="">— Nenhum —</option>
          ${employees.map(e => `<option value="${e.id}" ${existingDoc?.employee_id==e.id?'selected':''}>${e.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Arquivo</label>
        <input type="file" id="doc-file" style="width:100%;padding:.5rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-card);color:var(--text)">
        <div style="font-size:.75rem;color:var(--text-muted);margin-top:.25rem">${existingDoc?.file_url ? 'Arquivo atual: ' + existingDoc.file_url : 'Selecione o arquivo para upload'}</div>
      </div>
      <div id="doc-upload-progress" style="display:none;font-size:.82rem;color:var(--text-muted);text-align:center;padding:.5rem">Enviando...</div>
      <div style="margin-top:1rem;display:flex;gap:.5rem;justify-content:flex-end">
        <button class="btn btn-primary" onclick="saveDoc(${existingDoc ? existingDoc.id : ''})">Salvar</button>
        <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      </div>
    `);
  });
}

async function saveDoc(existingId) {
  const name = document.getElementById('doc-name').value.trim();
  const category = document.getElementById('doc-category').value;
  const employee_id = document.getElementById('doc-employee')?.value ? Number(document.getElementById('doc-employee').value) : null;
  const fileInput = document.getElementById('doc-file');
  if (!name) { showToast('Informe o nome do documento', 'error'); return; }
  let file_url = '';
  if (fileInput && fileInput.files && fileInput.files[0]) {
    const file = fileInput.files[0];
    document.getElementById('doc-upload-progress').style.display = 'block';
    file_url = await db.uploadDoc(file);
  }
  try {
    const doc = { name, category, file_url, employee_id };
    if (existingId) {
      if (!file_url) delete doc.file_url;
      await db.updateCompanyDoc(existingId, doc);
      showToast('Documento atualizado!', 'success');
    } else {
      await db.insertCompanyDoc(doc);
      showToast('Documento adicionado!', 'success');
    }
    closeModal();
    renderDocs();
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

async function signDoc(id) {
  const name = prompt('Nome para assinatura:');
  if (!name || !name.trim()) return;
  try {
    await db.updateCompanyDoc(id, { signed_by: name.trim(), signed_at: new Date().toISOString() });
    showToast('✅ Documento assinado por ' + name.trim(), 'success');
    renderDocs();
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

async function deleteDoc(id) {
  if (!confirm('Excluir este documento?')) return;
  await db.deleteCompanyDoc(id);
  showToast('Documento excluído!', 'success');
  renderDocs();
}

/* ============================================
   AUTOMAÇÕES (Rule Builder + Trigger Engine)
   ============================================ */
async function renderAutomation() {
  const content = document.getElementById('automation-content');
  content.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-muted)">Carregando...</div>`;
  const rules = await db.getAutomationRules();

  const triggerLabels = {
    task_created: 'Tarefa Criada',
    task_completed: 'Tarefa Concluída',
    task_overdue: 'Tarefa Atrasada',
    schedule: 'Agendamento (horário)',
    employee_inactive: 'Funcionário Inativo',
  };
  const actionLabels = {
    assign_task: 'Atribuir Tarefa',
    send_notification: 'Enviar Notificação',
    update_status: 'Alterar Status',
    create_task: 'Criar Tarefa',
    notify_gestor: 'Notificar Gestor',
  };
  const triggerIcons = { task_created:'📋', task_completed:'✅', task_overdue:'⏰', schedule:'🕐', employee_inactive:'😴' };
  const actionIcons = { assign_task:'👤', send_notification:'🔔', update_status:'🔄', create_task:'➕', notify_gestor:'📢' };

  if (!rules.length) {
    content.innerHTML = `
      <div class="auto-empty">
        <div class="auto-empty-icon">⚡</div>
        <div class="auto-empty-text">Nenhuma regra de automação criada</div>
        <div class="auto-empty-sub">Crie regras SE/ENTÃO para automatizar tarefas e notificações</div>
      </div>`;
    document.getElementById('btn-new-rule').onclick = () => showRuleModal();
    return;
  }

  content.innerHTML = `<div class="auto-grid">
    ${rules.map(r => {
      const tc = r.trigger_config || {};
      const ac = r.action_config || {};
      const tIcon = triggerIcons[r.trigger_type] || '⚡';
      const aIcon = actionIcons[r.action_type] || '⚡';
      return `<div class="auto-card ${r.active ? '' : 'inactive'}">
        <div class="auto-card-header">
          <div class="auto-card-header-left">
            <div class="auto-icon ${r.active ? 'active' : ''}">${r.active ? '⚡' : '⏸'}</div>
            <h3 class="auto-name">${r.name}</h3>
          </div>
          <div class="auto-card-actions">
            <label class="auto-toggle">
              <input type="checkbox" ${r.active ? 'checked' : ''} onchange="toggleRule(${r.id}, this.checked)">
              Ativo
            </label>
            <button class="btn btn-sm btn-secondary" onclick="editRule(${r.id})" title="Editar">✎</button>
            <button class="btn btn-sm btn-danger" onclick="deleteRule(${r.id})" title="Excluir">✕</button>
          </div>
        </div>
        <div class="auto-card-body">
          <div class="auto-pipeline">
            <div class="auto-step">
              <span class="auto-step-label">${tIcon} SE</span>
              <span class="auto-step-title">${triggerLabels[r.trigger_type] || r.trigger_type}</span>
              ${tc.sector ? `<span class="auto-step-detail">Setor: ${tc.sector}</span>` : ''}
              ${tc.delay_minutes ? `<span class="auto-step-detail">Após ${tc.delay_minutes} min</span>` : ''}
            </div>
            <div class="auto-arrow">→</div>
            <div class="auto-step">
              <span class="auto-step-label">${aIcon} ENTÃO</span>
              <span class="auto-step-title">${actionLabels[r.action_type] || r.action_type}</span>
              ${ac.title ? `<span class="auto-step-detail">Tarefa: ${ac.title}</span>` : ''}
              ${ac.message ? `<span class="auto-step-detail">Msg: ${ac.message}</span>` : ''}
            </div>
          </div>
        </div>
      </div>`;
    }).join('')}
  </div>`;

  document.getElementById('btn-new-rule').onclick = () => showRuleModal();
}

function showRuleModal(rule) {
  const r = rule || { name: '', trigger_type: 'task_created', trigger_config: {}, action_type: 'send_notification', action_config: {}, active: true };
  const tc = r.trigger_config || {};
  const ac = r.action_config || {};

  const catOptions = [
    { k: 'task_created', v: 'Tarefa for criada', icon: '📋' },
    { k: 'task_completed', v: 'Tarefa for concluída', icon: '✅' },
    { k: 'task_overdue', v: 'Tarefa atrasar', icon: '⏰' },
    { k: 'employee_inactive', v: 'Funcionário ficar inativo', icon: '😴' },
  ];
  const actOptions = [
    { k: 'send_notification', v: 'Notificar equipe', icon: '🔔' },
    { k: 'notify_gestor', v: 'Notificar gestor', icon: '📢' },
    { k: 'create_task', v: 'Criar nova tarefa', icon: '➕' },
    { k: 'assign_task', v: 'Atribuir para alguém', icon: '👤' },
  ];

  showModal(rule ? 'Editar Regra' : 'Nova Regra de Automação', `
    <div class="form-group"><label>Nome da regra</label><input type="text" id="rule-name" value="${r.name}" placeholder="Ex: Notificar atrasos" class="auto-config-input"></div>
    <div class="form-group">
      <label style="display:block;margin-bottom:.35rem;font-size:.82rem;color:var(--text-muted)">SE (gatilho)</label>
      <div class="auto-modal-grid">
        ${catOptions.map(o => `<button type="button" class="auto-option-btn ${r.trigger_type === o.k ? 'selected' : ''}" onclick="selectTrigger('${o.k}',this)">${o.icon} ${o.v}</button>`).join('')}
      </div>
      <input type="hidden" id="rule-trigger" value="${r.trigger_type}">
    </div>
    <div class="form-group">
      <label style="display:block;margin-bottom:.35rem;font-size:.82rem;color:var(--text-muted)">ENTÃO (ação)</label>
      <div class="auto-modal-grid">
        ${actOptions.map(o => `<button type="button" class="auto-option-btn ${r.action_type === o.k ? 'selected' : ''}" onclick="selectAction('${o.k}',this)">${o.icon} ${o.v}</button>`).join('')}
      </div>
      <input type="hidden" id="rule-action" value="${r.action_type}">
    </div>
    <div class="auto-config-box">
      <div class="form-group"><label>Mensagem ou título da tarefa</label><input type="text" id="rule-action-message" value="${ac.title || ac.message || ''}" placeholder="Ex: Revisar urgente" class="auto-config-input"></div>
      <div class="form-group"><label>Setor (opcional, vazio = todos)</label><input type="text" id="rule-trigger-sector" value="${tc.sector || ''}" placeholder="Ex: Operações" class="auto-config-input"></div>
    </div>
    <div style="margin-top:1rem;display:flex;gap:.5rem;justify-content:flex-end">
      <button class="btn btn-primary" onclick="saveRule(${r.id || 'null'})">Salvar</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    </div>
  `);
}

function selectTrigger(val, btn) {
  document.getElementById('rule-trigger').value = val;
  btn.closest('div').querySelectorAll('.selected').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

function selectAction(val, btn) {
  document.getElementById('rule-action').value = val;
  btn.closest('div').querySelectorAll('.selected').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

async function saveRule(id) {
  const rule = {
    name: document.getElementById('rule-name').value.trim() || 'Regra sem nome',
    trigger_type: document.getElementById('rule-trigger').value,
    action_type: document.getElementById('rule-action').value,
    trigger_config: {
      sector: document.getElementById('rule-trigger-sector').value.trim() || null,
    },
    action_config: {
      title: document.getElementById('rule-action-message').value.trim(),
      message: document.getElementById('rule-action-message').value.trim(),
    },
    active: true,
  };
  try {
    if (id) { await db.updateAutomationRule(id, rule); showToast('Regra atualizada!', 'success'); }
    else { await db.insertAutomationRule(rule); showToast('Regra criada!', 'success'); }
    closeModal();
    renderAutomation();
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

async function toggleRule(id, active) {
  await db.updateAutomationRule(id, { active });
  showToast(active ? 'Regra ativada' : 'Regra desativada', 'info');
}

async function editRule(id) {
  const rules = await db.getAutomationRules();
  const r = rules.find(x => x.id === id);
  if (r) showRuleModal(r);
}

async function deleteRule(id) {
  if (!confirm('Excluir esta regra?')) return;
  await db.deleteAutomationRule(id);
  showToast('Regra excluída!', 'success');
  renderAutomation();
}

// Trigger Engine — called when tasks change
async function runTriggerEngine(eventType, eventData) {
  try {
    const rules = await db.getAutomationRules();
    const matching = rules.filter(r => r.active && r.trigger_type === eventType);
    for (const rule of matching) {
      const tc = rule.trigger_config || {};
      const ac = rule.action_config || {};
      // Check sector filter
      if (tc.sector && eventData.sector && eventData.sector !== tc.sector) continue;
      // Execute action
      switch (rule.action_type) {
        case 'send_notification':
          showToast('🔔 ' + (ac.message || ac.title || 'Notificação automática'), 'info');
          break;
        case 'notify_gestor':
          showToast('📋 ' + (ac.message || 'Notificação para o gestor'), 'info');
          break;
        case 'create_task':
          try {
            await db.insertTask({
              title: ac.title || 'Tarefa automática',
              description: ac.message || '',
              date: todayBrasil(),
              status: 'pending',
              assignee: ac.assignee || App.state.user?.id || null,
            });
            showToast('✅ Tarefa automática criada!', 'success');
          } catch (e) { console.warn('Auto task creation failed:', e); }
          break;
        case 'assign_task':
          if (eventData.taskId && ac.assignee) {
            await db.updateTask(eventData.taskId, { assignee: ac.assignee });
          }
          break;
        case 'update_status':
          if (eventData.taskId && ac.status) {
            await db.updateTask(eventData.taskId, { status: ac.status });
          }
          break;
      }
    }
  } catch (e) { console.warn('Trigger engine:', e); }
}

/* ============================================
   JORNADA (Check-in/out)
   ============================================ */
/* ============================================
   QUALITY RATING
   ============================================ */
async function rateTask(taskId) {
  const t = await db.getTask(taskId);
  if (!t) return;
  openModal('Avaliar: ' + t.title, `
    <div style="margin-bottom:1rem;font-size:.85rem;color:var(--text-secondary)">Avalie a execução desta tarefa</div>
    <div class="form-group"><label>Qualidade (1-5)</label><input type="number" id="r-quality" min="1" max="5" value="5"></div>
    <div class="form-group"><label>Prazo (1-5)</label><input type="number" id="r-deadline" min="1" max="5" value="5"></div>
    <div class="form-group"><label>Execução (1-5)</label><input type="number" id="r-execution" min="1" max="5" value="5"></div>
    <div class="form-group"><label>Comentário</label><textarea id="r-comment" placeholder="Opcional"></textarea></div>
    <div class="form-row">
      <button class="btn btn-primary" onclick="saveRating(${taskId})">Salvar Avaliação</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    </div>
  `);
}

async function saveRating(taskId) {
  const quality = parseInt(document.getElementById('r-quality').value);
  const deadline = parseInt(document.getElementById('r-deadline').value);
  const execution = parseInt(document.getElementById('r-execution').value);
  const comment = document.getElementById('r-comment').value.trim();
  if (!quality || !deadline || !execution) { showToast('Preencha todas as notas', 'error'); return; }
  await db.insertQualityRating({ task_id: taskId, evaluator_id: App.state.user.id, quality_score: quality, deadline_score: deadline, execution_score: execution, comment });
  closeModal();
  showToast('Avaliação registrada!', 'success');
}

/* ============================================
   Vision IA
   ============================================ */
function openOPSAI() {
  const msgs = App.state.aiMessages || [];
  App.state._aiSending = false;
  showModal('Vision IA', renderAIChat(msgs));
  document.getElementById('modal-container').classList.add('large');
  document.getElementById('modal-body').style.padding = '0';
  document.getElementById('modal-body').style.display = 'flex';
  document.getElementById('modal-body').style.flexDirection = 'column';
  msgs.forEach((m, i) => {
    const el = document.getElementById('ai-msg-' + i);
    if (el) el.innerHTML = m.content;
  });
  setTimeout(() => {
    const input = document.getElementById('ai-input');
    if (input) input.focus();
    const c = document.getElementById('ai-chat');
    if (c) c.scrollTop = c.scrollHeight;
  }, 50);
}

function renderAIChat(messages) {
  return `
    <div id="ai-chat" class="ai-chat">
      <div class="ai-welcome">Pergunte algo sobre sua operação:</div>
      <div class="ai-suggestions">
        <button class="btn" onclick="suggestAI('Como está minha operação hoje?')">📊 Status geral</button>
        <button class="btn" onclick="suggestAI('Quem está improdutivo?')">😴 Inativos</button>
        <button class="btn" onclick="suggestAI('Qual área com pior desempenho?')">📉 Pior área</button>
        <button class="btn" onclick="suggestAI('Tarefas críticas atrasadas')">⚠️ Atrasadas</button>
        <button class="btn" onclick="suggestAI('Ranking de desempenho da equipe')">🏆 Ranking</button>
      </div>
      ${messages.map((m, i) => `
        <div class="ai-msg ${m.role}">
          <div id="ai-msg-${i}">${m.content}</div>
        </div>
      `).join('')}
      <div id="ai-loading" class="ai-loading">🤔 Pensando...</div>
    </div>
    <div class="ai-input-bar">
      <input type="text" id="ai-input" class="ai-input" placeholder="Digite sua pergunta..." onkeydown="if(event.key==='Enter'&&!App.state._aiSending)sendAIMessage()">
      <button id="btn-ai-send" class="btn btn-primary ai-send-btn" onclick="if(!App.state._aiSending)sendAIMessage()">➤</button>
    </div>
  `;
}

function suggestAI(question) {
  if (!App.state.aiMessages) App.state.aiMessages = [];
  App.state.aiMessages.push({ role: 'user', content: question });
  openOPSAI();
  sendAIMessage(true);
}

async function collectOpsContext() {
  const [employees, tasks, sectors, allocations] = await Promise.all([
    getCachedEmployees(), getCachedTasks(), db.getSectors(), getCachedAllocations(),
  ]);
  const today = todayBrasil();
  const todayAllocs = allocations.filter(a => (a.allocated_at || '').startsWith(today));
  return {
    today, totalEmployees: employees.length,
    employees: employees.map(e => ({ id: e.id, name: e.name, role: e.role, area: todayAllocs.find(a => a.employee_id === e.id)?.area || '' })),
    totalTasks: tasks.length,
    completedToday: tasks.filter(t => t.status === 'completed' && t.date === today).length,
    overdueTasks: tasks.filter(t => t.status !== 'completed' && t.date < today).length,
    pendingTasks: tasks.filter(t => t.status !== 'completed' && t.date >= today).length,
    sectors: sectors?.map(s => ({ name: s.name, goal: s.goal })) || [],
    allocations: todayAllocs.map(a => ({ employee: getEmployeeName(a.employee_id, employees), area: a.area })),
    recentTasks: tasks.slice(0, 20).map(t => ({ title: t.title, status: t.status, date: t.date, assignee: getEmployeeName(t.assignee, employees) })),
  };
}

async function sendAIMessage(skipRender) {
  if (App.state._aiSending) return;

  App.state._aiSending = true;

  const input = document.getElementById('ai-input');
  const text = skipRender ? null : (input?.value?.trim() || '');
  if (!text && !skipRender) { App.state._aiSending = false; return; }
  const q = text || (App.state.aiMessages?.length ? App.state.aiMessages[App.state.aiMessages.length - 1]?.content : '');
  if (!q) { App.state._aiSending = false; return; }

  if (!skipRender) {
    if (!App.state.aiMessages) App.state.aiMessages = [];
    App.state.aiMessages.push({ role: 'user', content: q });
    if (input) input.value = '';
    openOPSAI();
  }

  document.getElementById('ai-loading').style.display = 'block';

  const DEFAULT_GROQ_KEY = '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';
  const apiKey = localStorage.getItem('ops-ai-key') || DEFAULT_GROQ_KEY;
  const context = await collectOpsContext();

  if (!apiKey) {
    App.state.aiMessages.push({ role: 'assistant', content: '💡 Análise local (sem chave API):\n\n' + localAnalysis(q, context) });
    App.state._aiSending = false;
    openOPSAI();
    return;
  }

  const systemPrompt = `Você é o Vision IA. Responda em português (pt-BR) de forma direta e profissional.

DADOS DA OPERAÇÃO (${context.today}):
- Total de funcionários: ${context.totalEmployees}
- Tarefas: ${context.totalTasks} total | ${context.completedToday} concluídas hoje | ${context.overdueTasks} atrasadas | ${context.pendingTasks} pendentes
- Setores: ${context.sectors.map(s => s.name + (s.goal ? ' (meta ' + s.goal + '%)' : '')).join(', ') || 'Nenhum'}
- Alocações do dia: ${context.allocations.length ? context.allocations.map(a => a.employee + ' → ' + a.area).join(' | ') : 'Nenhuma'}

Funcionários:
${context.employees.map(e => '- ' + e.name + ' (' + e.role + ')' + (e.area ? ' → ' + e.area : '')).join('\n')}

Tarefas recentes:
${context.recentTasks.map(t => '- "' + t.title + '" | ' + t.status + ' | ' + t.date + ' | ' + t.assignee).join('\n')}`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: q }] }),
    });
    if (!res.ok) throw new Error('API retornou ' + res.status + ': ' + (await res.text()));
    const data = await res.json();
    if (data.error) throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
    const answer = data.choices?.[0]?.message?.content;
    if (!answer) throw new Error('Resposta vazia da API');
    App.state.aiMessages.push({ role: 'assistant', content: answer });
    App.state._aiRateLimited = null;
  } catch (e) {
    const msg = e.message || 'Erro desconhecido';
    App.state.aiMessages.push({ role: 'assistant', content: '⚠️ Erro na API: ' + msg + '\n\n💡 Análise local:\n\n' + localAnalysis(q, context) + '\n\n<button class="btn btn-sm btn-primary" onclick="App.state._aiRateLimited=null;sendAIMessage(true)" style="margin-top:.5rem">🔄 Tentar novamente</button>' });
  }

  App.state._aiSending = false;
  openOPSAI();
}

function localAnalysis(query, context) {
  const q = query.toLowerCase();
  if (q.includes('atrasada') || q.includes('crítica') || q.includes('vencida')) {
    return `⚠️ ${context.overdueTasks} tarefas atrasadas`;
  }
  return '💡 Pergunte sobre status, atrasadas ou desempenho.';
}

/* ============================================
   PHOTO ZOOM
   ============================================ */
function openPhotoZoom(src) {
  openModal('', `
    <div style="display:flex;flex-direction:column;align-items:center;gap:.5rem;padding:1rem">
      <img src="${src}" style="max-width:100%;max-height:80vh;border-radius:var(--radius-md);object-fit:contain;cursor:zoom-in" onclick="this.style.objectFit=this.style.objectFit==='contain'?'none':'contain';this.style.maxWidth=this.style.maxWidth==='100%'?'none':'100%'">
      <button class="btn btn-sm btn-secondary" onclick="closeModal()">Fechar</button>
    </div>
  `, { large: true, maxWidth: '800px' });
}

function togglePhotoZoom(img) {
  img.style.objectFit = img.style.objectFit === 'contain' ? 'none' : 'contain';
  img.style.maxWidth = img.style.maxWidth === '100%' ? 'none' : '100%';
}

/* ============================================
   SETTINGS / SECTORS CRUD
   ============================================ */
let settingsSectors = [];

async function renderSettings() {
  const container = document.getElementById('settings-content');
  const sectors = await db.getSectors();
  settingsSectors = sectors;

  const defaultSectors = [
    { name: 'Recepcao', icon: '📋', max_capacity: 3, goal: 'Atendimento de Excelencia', target: '95% de satisfacao' },
    { name: 'Operacoes', icon: '⚙️', max_capacity: 4, goal: 'Eficiencia Operacional', target: '100% tarefas no prazo' },
    { name: 'Seguranca', icon: '🔒', max_capacity: 3, goal: 'Seguranca Total', target: 'Zero incidentes' },
    { name: 'Manutencao', icon: '🔧', max_capacity: 3, goal: 'Disponibilidade Total', target: '100% equipamentos OK' },
  ];
  const dbEmpty = sectors.length === 0;

  let recOpts = App.state.recurrenceOptions || [];
  if (recOpts.length === 0) {
    recOpts = recurrenceOptions();
  }

  const cs = await getCompanySettings();

  container.innerHTML = `
    <div class="card">
      <div class="card-header"><h3>🏢 Dados da Empresa</h3></div>
      <div class="card-body">
        <div class="company-settings-grid">
          <div class="form-group"><label>Nome da Empresa</label><input type="text" id="cs-name" value="${cs.name}" class="auto-config-input" placeholder="Minha Empresa"></div>
          <div class="form-group"><label>CNPJ</label><input type="text" id="cs-cnpj" value="${cs.cnpj}" class="auto-config-input" placeholder="00.000.000/0001-00"></div>
          <div class="form-group" style="grid-column:1/-1"><label>Endereço</label><input type="text" id="cs-address" value="${cs.address}" class="auto-config-input" placeholder="Rua, número, bairro, cidade"></div>
          <div class="form-group"><label>Telefone</label><input type="text" id="cs-phone" value="${cs.phone}" class="auto-config-input" placeholder="(11) 99999-9999"></div>
          <div class="form-group"><label>E-mail</label><input type="email" id="cs-email" value="${cs.email}" class="auto-config-input" placeholder="contato@empresa.com"></div>
          <div class="form-group"><label>Logo</label>
            <div class="company-logo-upload" onclick="document.getElementById('cs-logo-input').click()" id="cs-logo-preview">
              ${cs.logo ? `<img src="${cs.logo}">` : '<span style="font-size:2rem;opacity:.4">📷</span>'}
            </div>
            <input type="file" id="cs-logo-input" accept="image/*" style="display:none" onchange="handleCompanyLogo(event)">
          </div>
        </div>
        <button class="btn btn-primary" style="margin-top:.75rem" onclick="saveCompanySettings()">Salvar Dados</button>
      </div>
    </div>
    <div class="card" style="margin-top:1rem">
      <div class="card-header"><h3>Setores / Áreas de Trabalho</h3></div>
      <div class="card-body">
        ${dbEmpty ? `<div style="font-size:.85rem;color:var(--text-muted);margin-bottom:1rem">Nenhum setor cadastrado.</div>` : ''}
        <div class="sectors-list" id="sectors-list">
          ${(dbEmpty ? defaultSectors : sectors).map((s, i) => renderSectorCard(s, i, dbEmpty)).join('')}
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:1rem">
      <div class="card-header"><h3>Opções de Recorrência</h3></div>
      <div class="card-body">
        <div style="font-size:.82rem;color:var(--text-muted);margin-bottom:.75rem">Tipos de recorrência disponíveis ao criar tarefas.</div>
        <div class="recurrence-list" id="recurrence-list">
          ${recOpts.map((r, i) => `<div class="recurrence-item" data-recidx="${i}">
            <div class="recurrence-info">
              <span class="recurrence-label">${r.label}</span>
            </div>
            <div class="recurrence-actions">
              <button class="btn btn-sm btn-secondary" onclick="editRecurrenceOption(${i})">Editar</button>
              <button class="btn btn-sm btn-danger" onclick="deleteRecurrenceOption(${i})">Excluir</button>
            </div>
          </div>`).join('')}
        </div>
        <button class="btn btn-sm btn-primary" style="margin-top:.5rem" onclick="showNewRecurrenceOptionModal()">+ Nova Opção</button>
      </div>
    </div>`;

  document.getElementById('btn-new-sector').addEventListener('click', showNewSectorModal);
}

/* ============================================
   COMPANY SETTINGS
   ============================================ */
async function getCompanySettings() {
  try {
    const c = await db.getCompany(App.state.user?.company_id);
    if (c) {
      const data = { name: c.name || '', cnpj: c.cnpj || '', address: c.address || '', phone: c.phone || '', email: c.email || '', logo: c.logo_url || '' };
      localStorage.setItem('ops-company', JSON.stringify(data));
      return data;
    }
  } catch (e) {}
  try { return JSON.parse(localStorage.getItem('ops-company') || '{}'); } catch (e) { return {}; }
}

function handleCompanyLogo(e) {
  const file = e.target.files[0];
  if (!file) return;
  const preview = document.getElementById('cs-logo-preview');
  const reader = new FileReader();
  reader.onload = function(ev) {
    preview.innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:contain">`;
  };
  reader.readAsDataURL(file);
  // Upload happens on save
  window._pendingLogo = file;
}

async function saveCompanySettings() {
  const companyId = App.state.user?.company_id;
  if (!companyId) { showToast('Empresa não identificada', 'error'); return; }

  let logoUrl = (document.querySelector('#cs-logo-preview img') || {}).src || '';
  if (window._pendingLogo) {
    try {
      logoUrl = await db.uploadCompanyLogo(window._pendingLogo);
    } catch (e) {
      showToast('Erro ao enviar logo: ' + e.message, 'warning');
    }
    delete window._pendingLogo;
  }

  const data = {
    name: document.getElementById('cs-name').value.trim(),
    cnpj: document.getElementById('cs-cnpj').value.trim(),
    address: document.getElementById('cs-address').value.trim(),
    phone: document.getElementById('cs-phone').value.trim(),
    email: document.getElementById('cs-email').value.trim(),
    logo: logoUrl,
  };
  localStorage.setItem('ops-company', JSON.stringify(data));
  try {
    await db.updateCompany(companyId, {
      name: data.name,
      cnpj: data.cnpj,
      address: data.address,
      phone: data.phone,
      email: data.email,
      logo_url: data.logo,
    });
  } catch (e) {
    showToast('Dados salvos localmente, mas erro no servidor: ' + e.message, 'warning');
    return;
  }
  showToast('Dados da empresa salvos!', 'success');
}

/* ============================================
   PRINT / REPORT SYSTEM
   ============================================ */
async function printReport(title, contentHtml) {
  const cs = await getCompanySettings();
  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR') + ' às ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const printHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${title}</title>
<style>
  @page { margin: 20mm 15mm }
  * { box-sizing:border-box;margin:0;padding:0 }
  body { font-family: 'Segoe UI', Roboto, Arial, sans-serif; color:#1a1a1a; font-size:11pt; line-height:1.5; padding:0 10mm }
  .report-header { display:flex;align-items:center;gap:1rem;padding-bottom:1rem;border-bottom:2px solid #2563eb;margin-bottom:1.5rem }
  .report-logo { width:70px;height:70px;border-radius:6px;overflow:hidden;flex-shrink:0 }
  .report-logo img { width:100%;height:100%;object-fit:contain }
  .report-company { flex:1 }
  .report-company h1 { font-size:16pt;margin:0;color:#111 }
  .report-company p { font-size:8.5pt;color:#555;margin:2px 0 }
  .report-title { text-align:center;margin-bottom:1.5rem }
  .report-title h2 { font-size:14pt;color:#2563eb;margin:0 0 4px }
  .report-title span { font-size:8.5pt;color:#888 }
  table { width:100%;border-collapse:collapse;margin-bottom:1rem }
  th { background:#2563eb;color:#fff;padding:6px 8px;font-size:9pt;text-align:left;font-weight:600 }
  td { padding:5px 8px;font-size:9pt;border-bottom:1px solid #ddd }
  tr:nth-child(even) td { background:#f8f9fb }
  .status-badge { display:inline-block;padding:1px 6px;border-radius:3px;font-size:8pt;font-weight:600 }
  .status-completed { background:#d1fae5;color:#065f46 }
  .status-pending { background:#fef3c7;color:#92400e }
  .status-overdue { background:#fee2e2;color:#991b1b }
  .report-footer { position:fixed;bottom:10mm;left:15mm;right:15mm;text-align:center;font-size:8pt;color:#999;border-top:1px solid #ddd;padding-top:4mm }
  .report-meta { font-size:8.5pt;color:#888;margin-bottom:1rem }
  @media print { .report-footer { position:fixed } }
</style>
</head>
<body>
  <div class="report-header">
    ${cs.logo ? `<div class="report-logo"><img src="${cs.logo}"></div>` : ''}
    <div class="report-company">
      <h1>${cs.name || 'OpsVision'}</h1>
      ${cs.cnpj ? '<p>CNPJ: ' + cs.cnpj + '</p>' : ''}
      ${cs.address ? '<p>' + cs.address + '</p>' : ''}
      ${cs.phone || cs.email ? '<p>' + [cs.phone, cs.email].filter(Boolean).join(' | ') + '</p>' : ''}
    </div>
  </div>
  <div class="report-title">
    <h2>${title}</h2>
    <span>Gerado em ${dateStr}</span>
  </div>
  ${contentHtml}
  <div class="report-footer">OpsVision — Sistema de Gestão Operacional</div>
</body>
</html>`;

  const w = window.open('', '_blank');
  w.document.write(printHtml);
  w.document.close();
  setTimeout(() => { w.print(); }, 500);
}

async function printTasks() {
  const tasks = await getCachedTasks();
  const employees = await getCachedEmployees();
  const taskAssignees = await getCachedTaskAssignees() || [];
  const assigneeMap = {};
  for (const ta of taskAssignees) {
    if (!assigneeMap[ta.task_id]) assigneeMap[ta.task_id] = [];
    assigneeMap[ta.task_id].push(ta.employee_id);
  }
  const today = todayBrasil();

  const rows = tasks.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)).map(t => {
    const aIds = assigneeMap[t.id] || (t.assignee ? [t.assignee] : []);
    const names = aIds.map(id => employees.find(e => e.id === id)?.name || '—').join(', ');
    const overdue = t.status !== 'completed' && t.date < today;
    const statusClass = t.status === 'completed' ? 'completed' : overdue ? 'overdue' : 'pending';
    const statusName = t.status === 'completed' ? 'Concluída' : overdue ? 'Atrasada' : 'Pendente';
    return `<tr>
      <td>${t.title}</td>
      <td>${names}</td>
      <td>${t.date}</td>
      <td>${t.time}</td>
      <td><span class="status-badge status-${statusClass}">${statusName}</span></td>
    </tr>`;
  }).join('');

  const completed = tasks.filter(t => t.status === 'completed').length;
  const pending = tasks.filter(t => t.status === 'pending').length;
  const overdue = tasks.filter(t => t.status !== 'completed' && t.date < today).length;

  await printReport('Relatório de Tarefas', `
    <div class="report-meta">Total: ${tasks.length} | Concluídas: ${completed} | Pendentes: ${pending} | Atrasadas: ${overdue}</div>
    <table>
      <thead><tr><th>Título</th><th>Responsável(is)</th><th>Data</th><th>Hora</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`);
}

async function printTeam() {
  const employees = await getCachedEmployees();
  const sectors = await getCachedSectors();
  const allocations = await getCachedAllocations() || [];

  const sectorNames = {};
  for (const s of sectors) sectorNames[s.id] = s.name;
  const allocMap = {};
  for (const a of allocations) allocMap[a.employee_id] = sectorNames[a.area] || a.area;

  const rows = employees.map(e => {
    const area = allocMap[e.area] || allocMap[e.id] || '—';
    return `<tr>
      <td>${e.name}</td>
      <td>${e.role || '—'}</td>
      <td>${area}</td>
      <td>${e.status === 'free' ? 'Livre' : e.status === 'busy' ? 'Ocupado' : 'Em Tarefa'}</td>
    </tr>`;
  }).join('');

  await printReport('Relatório da Equipe', `
    <div class="report-meta">Total de funcionários: ${employees.length}</div>
    <table>
      <thead><tr><th>Nome</th><th>Cargo</th><th>Setor</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`);
}

function renderSectorCard(s, idx, isDefault = false) {
  const escapedName = s.name.replace(/'/g, "\\'");
  return `<div class="sector-card" data-sector-idx="${idx}">
    <div class="sector-card-header">
      <span class="sector-icon">${s.icon || ''}</span>
      <div class="sector-info">
        <div class="sector-name">${escapedName}</div>
        <div class="sector-meta">Capacidade: ${s.max_capacity} pessoas</div>
      </div>
      ${isDefault ? '<span class="sector-default-badge">Padrão</span>' : ''}
    </div>
    <div class="sector-goal">
      <strong>🎯 Meta:</strong> ${s.goal}<br>
      <span style="font-size:.8rem;color:var(--text-muted)">Alvo: ${s.target}</span>
    </div>
    <div class="sector-actions">
      <button class="btn btn-sm btn-secondary" onclick="editSector(${idx})">Editar</button>
      ${!isDefault ? `<button class="btn btn-sm btn-danger" onclick="deleteSector(${idx})">Excluir</button>` : ''}
    </div>
  </div>`;
}

function showNewSectorModal() {
  openModal('Novo Setor', `
    <div class="form-group"><label>Nome do Setor</label><input type="text" id="sector-name" placeholder="Ex: Recepção"></div>
    <div class="form-group"><label>Ícone (emoji)</label><input type="text" id="sector-icon" placeholder="Ex: 📋" maxlength="2"></div>
    <div class="form-group"><label>Capacidade Máxima</label><input type="number" id="sector-capacity" value="3" min="1" max="20"></div>
    <div class="form-group"><label>Meta</label><input type="text" id="sector-goal" placeholder="Ex: Atendimento de Excelência"></div>
    <div class="form-group"><label>Alvo</label><input type="text" id="sector-target" placeholder="Ex: 95% de satisfação"></div>
    <div class="form-row">
      <button class="btn btn-primary" onclick="saveNewSector()">Salvar</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    </div>
  `);
}

async function saveNewSector() {
  const name = document.getElementById('sector-name').value.trim();
  const icon = document.getElementById('sector-icon').value.trim() || '';
  const capacity = parseInt(document.getElementById('sector-capacity').value) || 3;
  const goal = document.getElementById('sector-goal').value.trim() || '';
  const target = document.getElementById('sector-target').value.trim() || '';
  if (!name) { showToast('Nome do setor é obrigatório', 'error'); return; }

  const sector = { id: uid(), name, icon, max_capacity: capacity, goal, target };
  await db.insertSector(sector);
  invalidateCache('sectors');
  closeModal();
  renderSettings();
  showToast('Setor criado!', 'success');
}

async function editSector(idx) {
  const dbSectors = settingsSectors.length > 0 ? settingsSectors : areasList;
  const sector = dbSectors[idx];
  if (!sector) return;
  openModal('Editar Setor', `
    <div class="form-group"><label>Nome</label><input type="text" id="sector-name-edit" value="${sector.name}"></div>
    <div class="form-group"><label>Ícone</label><input type="text" id="sector-icon-edit" value="${sector.icon || ''}" maxlength="2"></div>
    <div class="form-group"><label>Capacidade Máxima</label><input type="number" id="sector-capacity-edit" value="${sector.max_capacity}" min="1" max="20"></div>
    <div class="form-group"><label>Meta</label><input type="text" id="sector-goal-edit" value="${sector.goal || ''}"></div>
    <div class="form-group"><label>Alvo</label><input type="text" id="sector-target-edit" value="${sector.target || ''}"></div>
    <div class="form-row">
      <button class="btn btn-primary" onclick="saveEditSector(${idx})">Salvar</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    </div>
  `);
}

async function saveEditSector(idx) {
  const dbSectors = settingsSectors.length > 0 ? settingsSectors : areasList;
  const sector = dbSectors[idx];
  if (!sector || !sector.id) { showToast('Setor não encontrado no banco.', 'error'); return; }
  const name = document.getElementById('sector-name-edit').value.trim();
  if (!name) { showToast('Nome obrigatório', 'error'); return; }
  const icon = document.getElementById('sector-icon-edit').value.trim() || '';
  const capacity = parseInt(document.getElementById('sector-capacity-edit').value) || 3;
  const goal = document.getElementById('sector-goal-edit').value.trim() || '';
  const target = document.getElementById('sector-target-edit').value.trim() || '';

  await db.updateSector(sector.id, { name, icon, max_capacity: capacity, goal, target });
  invalidateCache('sectors');
  closeModal();
  renderSettings();
  showToast('Setor atualizado!', 'success');
}

async function deleteSector(idx) {
  const dbSectors = settingsSectors.length > 0 ? settingsSectors : areasList;
  const sector = dbSectors[idx];
  if (!sector || !sector.id) { showToast('Setor não encontrado no banco.', 'error'); return; }
  if (!confirm('Excluir este setor?')) return;
  await db.deleteSector(sector.id);
  invalidateCache('sectors');
  renderSettings();
  showToast('Setor removido.', 'info');
}

/* ============================================
   SETTINGS — RECURRENCE OPTIONS
   ============================================ */
function showNewRecurrenceOptionModal() {
  openModal('Nova Opção de Recorrência', `
    <div class="form-group"><label>Nome</label><input type="text" id="rec-label" placeholder="Ex: Trimestral"></div>
    <div class="form-group"><label>Ordem</label><input type="number" id="rec-order" value="10" min="0"></div>
    <div class="form-row">
      <button class="btn btn-primary" onclick="saveNewRecurrenceOption()">Salvar</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    </div>
  `);
}

async function saveNewRecurrenceOption() {
  const label = document.getElementById('rec-label').value.trim();
  const order = parseInt(document.getElementById('rec-order').value) || 10;
  if (!label) { showToast('Preencha o nome', 'error'); return; }
  const key = label.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'custom';

  const opt = { id: uid(), key, label, sort_order: order };
  await db.insertRecurrenceOption(opt);
  invalidateCache('recurrenceOptions');
  const opts = await getCachedRecurrenceOptions();
  App.state.recurrenceOptions = opts;
  closeModal();
  renderSettings();
  showToast('Opção criada!', 'success');
}

function editRecurrenceOption(idx) {
  const opts = App.state.recurrenceOptions && App.state.recurrenceOptions.length > 0
    ? App.state.recurrenceOptions : recurrenceOptions();
  const r = opts[idx];
  if (!r) return;
  openModal('Editar Opção de Recorrência', `
    <div class="form-group"><label>Nome</label><input type="text" id="rec-label-edit" value="${r.label}"></div>
    <div class="form-group"><label>Ordem</label><input type="number" id="rec-order-edit" value="${r.sort_order || 10}" min="0"></div>
    <div class="form-row">
      <button class="btn btn-primary" onclick="saveEditRecurrenceOption(${idx})">Salvar</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    </div>
  `);
}

async function saveEditRecurrenceOption(idx) {
  const opts = App.state.recurrenceOptions;
  const r = opts && opts[idx];
  if (!r || !r.id) { showToast('Opção não encontrada no banco', 'error'); return; }
  const label = document.getElementById('rec-label-edit').value.trim();
  if (!label) { showToast('Preencha o nome', 'error'); return; }
  const sortOrder = parseInt(document.getElementById('rec-order-edit').value) || 10;
  const key = label.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'custom';

  await db.updateRecurrenceOption(r.id, { key, label, sort_order: sortOrder });
  invalidateCache('recurrenceOptions');
  const fresh = await getCachedRecurrenceOptions();
  App.state.recurrenceOptions = fresh;
  closeModal();
  renderSettings();
  showToast('Opção atualizada!', 'success');
}

async function deleteRecurrenceOption(idx) {
  const opts = App.state.recurrenceOptions;
  const r = opts && opts[idx];
  if (!r || !r.id) { showToast('Opção não encontrada no banco', 'error'); return; }
  if (!confirm('Excluir esta opção de recorrência?')) return;
  await db.deleteRecurrenceOption(r.id);
  invalidateCache('recurrenceOptions');
  const fresh = await getCachedRecurrenceOptions();
  App.state.recurrenceOptions = fresh;
  renderSettings();
  showToast('Opção removida.', 'info');
}

/* ============================================
   SEARCH
   ============================================ */
function setupSearch() {
  const searchInput = document.getElementById('global-search');
  let debounceTimer;

  searchInput.addEventListener('input', function() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const q = this.value.trim().toLowerCase();
      if (!q) return;

      const [tasks, employees] = await Promise.all([getCachedTasks(), getCachedEmployees()]);
      const results = tasks.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        getEmployeeName(t.assignee, employees).toLowerCase().includes(q)
      );

      if (results.length > 0) {
        showToast(`🔍 ${results.length} tarefa(s) encontrada(s) para "${q}"`, 'info');
        document.getElementById('filter-task-search').value = q;
        navigateTo('tasks');
      } else {
        showToast(`Nenhum resultado para "${q}"`, 'info');
      }
    }, 500);
  });
}

/* ============================================
   RESPONSIVE / TOGGLE SIDEBAR
   ============================================ */
function setupToggleSidebar() {
  const btn = document.getElementById('btn-toggle-sidebar');
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  function closeMobile() {
    sidebar.classList.remove('mobile-open');
    backdrop.classList.remove('show');
  }
  btn.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      sidebar.classList.toggle('mobile-open');
      backdrop.classList.toggle('show');
    } else {
      sidebar.classList.toggle('collapsed');
    }
  });
  backdrop.addEventListener('click', closeMobile);
  // close on resize to desktop
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) closeMobile();
  });
}

/* ============================================
   EVENT SETUP
   ============================================ */
function setupEvents() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const page = item.dataset.page;
      navigateTo(page);
      if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('mobile-open');
        document.getElementById('sidebar-backdrop').classList.remove('show');
      }
    });
  });

  document.getElementById('btn-login').addEventListener('click', doLogin);
  document.getElementById('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  // removed: type toggle (now gestor-only)
  document.getElementById('btn-signup').addEventListener('click', doSignup);
  document.getElementById('signup-password').addEventListener('keydown', e => { if (e.key === 'Enter') doSignup(); });
  document.getElementById('link-show-signup').addEventListener('click', e => { e.preventDefault(); toggleLoginForm(true); });
  document.getElementById('link-show-login').addEventListener('click', e => { e.preventDefault(); toggleLoginForm(false); });
  document.getElementById('btn-logout').addEventListener('click', doLogout);

  document.getElementById('notif-bell').addEventListener('click', e => {
    e.stopPropagation();
    const dd = document.getElementById('notif-dropdown');
    dd.classList.toggle('show');
    if (dd.classList.contains('show')) renderNotifDropdown();
  });
  document.addEventListener('click', () => {
    document.getElementById('notif-dropdown').classList.remove('show');
  });

  document.getElementById('mark-all-read').addEventListener('click', e => {
    e.stopPropagation();
    markAllNotifsRead();
  });

  document.getElementById('modal-close').addEventListener('click', closeModal);
  // Click outside fecha modal apenas em dispositivos touch (mobile/tablet)
  const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
  if (isTouchDevice) {
    document.getElementById('modal-overlay').addEventListener('click', e => {
      if (e.target === e.currentTarget) closeModal();
    });
  }

  document.getElementById('btn-new-task').addEventListener('click', showNewTaskModal);
  document.getElementById('btn-new-employee').addEventListener('click', showNewEmployeeModal);
  document.getElementById('btn-new-meeting').addEventListener('click', showNewMeetingModal);

  document.getElementById('filter-task-status').addEventListener('change', renderTasks);
  document.getElementById('filter-task-employee').addEventListener('change', renderTasks);
  document.getElementById('filter-task-search').addEventListener('input', renderTasks);
  document.getElementById('filter-task-date-start').addEventListener('change', renderTasks);
  document.getElementById('filter-task-date-end').addEventListener('change', renderTasks);

  document.getElementById('btn-agenda-prev').addEventListener('click', () => {
    App.state.agendaWeekOffset = (App.state.agendaWeekOffset || 0) - 1;
    renderAgenda();
  });
  document.getElementById('btn-agenda-next').addEventListener('click', () => {
    App.state.agendaWeekOffset = (App.state.agendaWeekOffset || 0) + 1;
    renderAgenda();
  });
  document.getElementById('btn-agenda-today').addEventListener('click', () => {
    App.state.agendaWeekOffset = 0;
    renderAgenda();
  });
}

/* ============================================
   TOAST NOTIFICATIONS
   ============================================ */
function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const g = ctx.createGain();
    g.connect(ctx.destination);
    g.gain.value = .15;

    // Two-tone chime
    [523.25, 659.25].forEach((freq, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(.15, ctx.currentTime + i * .12);
      g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + i * .12 + .15);
      o.connect(g);
      o.start(ctx.currentTime + i * .12);
      o.stop(ctx.currentTime + i * .12 + .15);
    });
  } catch (e) { /* audio not available */ }
}

function showBrowserNotif(title, body) {
  try {
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico', tag: 'opsvision' });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(p => {
        if (p === 'granted') new Notification(title, { body, icon: '/favicon.ico', tag: 'opsvision' });
      });
    }
  } catch (e) { /* notif API not available */ }
}

function showNotificationPopup(html, type) {
  const el = document.createElement('div');
  el.className = `toast-notification ${type || ''}`;
  el.innerHTML = html;
  el.onclick = () => el.remove();
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 5000);

  // Sound + browser notification (only if tab hidden)
  playNotifSound();
  if (document.hidden && type) {
    const title = type === 'task' ? 'Nova tarefa' : type === 'meeting' ? 'Reunião' : 'Notificação';
    const body = html.replace(/<[^>]*>/g, '').trim();
    showBrowserNotif(title, body);
  }
}

/* ============================================
   ONBOARDING WIZARD
   ============================================ */
async function checkOnboarding() {
  try {
    const company = await db.getCompany(App.state.user.company_id);
    if (!company) return;

    const onboardedKey = 'ops-onboarded-' + company.id;
    if (localStorage.getItem(onboardedKey)) return;
    if (company.setup_completed) {
      localStorage.setItem(onboardedKey, '1');
      return;
    }

    const sectors = await db.getSectors();
    if (sectors && sectors.length > 0) {
      try { await db.updateCompany(company.id, { setup_completed: true }); } catch (e) {}
      localStorage.setItem(onboardedKey, '1');
      return;
    }
    showOnboardingWizard(company, onboardedKey);
  } catch (e) {
    // Migration may be pending — skip
  }
}

function showOnboardingWizard(company, onboardedKey) {
  const steps = [
    {
      icon: '🚀', title: 'Bem-vindo ao OpsVision!',
      desc: 'Sistema de gestão operacional para sua empresa.',
      body: `
        <div class="onboard-feature-list">
          <div class="onboard-feature"><div class="onboard-feature-icon">📊</div><div class="onboard-feature-text"><strong>Central de Controle</strong><span>Painel em tempo real com métricas, gráficos e indicadores do seu negócio</span></div></div>
          <div class="onboard-feature"><div class="onboard-feature-icon">👥</div><div class="onboard-feature-text"><strong>Gestão de Equipe</strong><span>Cadastre funcionários, defina setores, alocações e escalas de trabalho</span></div></div>
          <div class="onboard-feature"><div class="onboard-feature-icon">📋</div><div class="onboard-feature-text"><strong>Tarefas Inteligentes</strong><span>Crie tarefas com comprovação, recorrência e múltiplos responsáveis</span></div></div>
          <div class="onboard-feature"><div class="onboard-feature-icon">🤖</div><div class="onboard-feature-text"><strong>Vision IA</strong><span>Assistente inteligente integrado via Groq — tire dúvidas, peça análises e sugestões em linguagem natural</span></div></div>
        </div>`,
    },
    {
      icon: '👥', title: 'Sua Equipe',
      desc: 'Gerencie funcionários, setores e alocações.',
      body: `
        <div class="onboard-feature-list">
          <div class="onboard-feature"><div class="onboard-feature-icon">➕</div><div class="onboard-feature-text"><strong>Cadastro de Funcionários</strong><span>Adicione colaboradores com cargo, nível de acesso e status</span></div></div>
          <div class="onboard-feature"><div class="onboard-feature-icon">📍</div><div class="onboard-feature-text"><strong>Alocação por Setor</strong><span>Distribua sua equipe nos setores da empresa</span></div></div>
          <div class="onboard-feature"><div class="onboard-feature-icon">🔑</div><div class="onboard-feature-text"><strong>Login Individual</strong><span>Crie acesso para cada funcionário com email e senha</span></div></div>
          <div class="onboard-feature"><div class="onboard-feature-icon">📅</div><div class="onboard-feature-text"><strong>Escalas</strong><span>Defina dias de trabalho, folga e férias</span></div></div>
        </div>`,
    },
    {
      icon: '🤖', title: 'Inteligência Artificial',
      desc: 'Vision IA — seu assistente inteligente integrado.',
      body: `
        <div class="onboard-feature-list">
          <div class="onboard-feature"><div class="onboard-feature-icon">💬</div><div class="onboard-feature-text"><strong>Chat Natural</strong><span>Pergunte "quantas tarefas estão atrasadas?" ou "resuma o dia" — a IA entende contexto</span></div></div>
          <div class="onboard-feature"><div class="onboard-feature-icon">📊</div><div class="onboard-feature-text"><strong>Análise de Dados</strong><span>A IA consulta dados reais do sistema: tarefas, equipe, metas, alocações</span></div></div>
          <div class="onboard-feature"><div class="onboard-feature-icon">⚡</div><div class="onboard-feature-text"><strong>Groq LLM</strong><span>Motor rápido e gratuito (llama-3.1-8b). Sem custos, sem limite de uso</span></div></div>
          <div class="onboard-feature"><div class="onboard-feature-icon">🔧</div><div class="onboard-feature-text"><strong>Chave Padrão</strong><span>Já incluímos uma chave Groq funcional. Você pode trocar nas Configurações</span></div></div>
        </div>`,
    },
    {
      icon: '📋', title: 'Tarefas & Metas',
      desc: 'Acompanhe o que precisa ser feito.',
      body: `
        <div class="onboard-feature-list">
          <div class="onboard-feature"><div class="onboard-feature-icon">✅</div><div class="onboard-feature-text"><strong>Criação e Execução</strong><span>Atribua tarefas com data, hora e opção de comprovação com foto</span></div></div>
          <div class="onboard-feature"><div class="onboard-feature-icon">🔄</div><div class="onboard-feature-text"><strong>Recorrência</strong><span>Tarefas diárias, semanais, mensais — repetem automaticamente</span></div></div>
          <div class="onboard-feature"><div class="onboard-feature-icon">👤</div><div class="onboard-feature-text"><strong>Múltiplos Responsáveis</strong><span>Uma tarefa pode ter vários funcionários responsáveis</span></div></div>
          <div class="onboard-feature"><div class="onboard-feature-icon">⭐</div><div class="onboard-feature-text"><strong>Avaliação de Qualidade</strong><span>Gestores avaliam tarefas concluídas com nota e feedback</span></div></div>
        </div>`,
    },
    {
      icon: '⚙️', title: 'Configurar Setores',
      desc: 'Vamos configurar os setores da sua empresa para começar.',
      body: `
        <p style="font-size:.85rem;color:var(--text-muted);margin:0 0 1rem">Adicione os setores da sua empresa. Ex: Recepção, Operações, Segurança, Manutenção.</p>
        <div id="onboard-sectors-list"></div>
        <div class="onboard-add-sector" onclick="addOnboardSector()">➕ Adicionar setor</div>`,
    },
  ];

  let currentStep = 0;
  const containerId = 'onboard-container';
  const existing = document.getElementById(containerId);
  if (existing) existing.remove();

  function renderStep() {
    const step = steps[currentStep];
    const isLast = currentStep === steps.length - 1;
    const overlay = document.getElementById(containerId);
    if (!overlay) return;

    overlay.innerHTML = `
      <div class="onboard-box">
        <div class="onboard-header">
          <div class="onboard-icon">${step.icon}</div>
          <h2>${step.title}</h2>
          <p>${step.desc}</p>
        </div>
        <div class="onboard-body">${step.body}</div>
        <div class="onboard-step-indicator">
          ${steps.map((_, i) => `<div class="onboard-dot ${i === currentStep ? 'active' : i < currentStep ? 'done' : ''}"></div>`).join('')}
        </div>
        <div class="onboard-footer">
          <button class="btn btn-secondary" onclick="skipOnboarding()">Pular</button>
          <div>
            ${currentStep > 0 ? `<button class="btn btn-secondary" onclick="onboardPrev()" style="margin-right:.5rem">Voltar</button>` : ''}
            <button class="btn btn-primary" onclick="${isLast ? 'finishOnboarding()' : 'onboardNext()'}">${isLast ? 'Finalizar' : 'Próximo'}</button>
          </div>
        </div>
      </div>`;

    if (isLast) populateSectorFields();
  }

  function populateSectorFields() {
    const list = document.getElementById('onboard-sectors-list');
    if (!list) return;
    if (!list.children.length) {
      ['Recepção','Operações','Segurança','Manutenção'].forEach(name => addOnboardSector(name));
    }
  }

  const overlay = document.createElement('div');
  overlay.id = containerId;
  overlay.className = 'onboard-overlay';
  document.body.appendChild(overlay);

  const dismiss = () => {
    overlay.remove();
    localStorage.setItem(onboardedKey, '1');
  };

  window.onboardNext = () => { currentStep++; renderStep(); };
  window.onboardPrev = () => { currentStep--; renderStep(); };
  window.skipOnboarding = () => dismiss();
  window.addOnboardSector = (name) => {
    const list = document.getElementById('onboard-sectors-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'onboard-sector-row';
    row.innerHTML = `
      <input type="text" class="auto-config-input" placeholder="Nome do setor" value="${name || ''}">
      <input type="number" class="auto-config-input" placeholder="Capacidade" value="5" style="width:90px">
      <button class="btn btn-sm btn-danger" onclick="this.parentElement.remove()" style="padding:4px 8px;font-size:.7rem">&times;</button>`;
    list.appendChild(row);
  };
  window.finishOnboarding = async () => {
    try {
      const rows = document.querySelectorAll('#onboard-sectors-list .onboard-sector-row');
      const sectors = [];
      rows.forEach(row => {
        const name = row.querySelector('input[type="text"]')?.value.trim();
        const capacity = parseInt(row.querySelector('input[type="number"]')?.value) || 0;
        if (name) sectors.push({ name, capacity });
      });
      for (const s of sectors) {
        await db.insertSector({ id: uid(), name: s.name, icon: '🏢', max_capacity: s.capacity, goal: 0, target: 0 });
      }
      try {
        await db.updateCompany(App.state.user.company_id, { setup_completed: true });
      } catch (e) { /* column may not exist */ }
      invalidateCache('sectors');
      dismiss();
      showToast('Configuração concluída! Bem-vindo ao OpsVision 🚀', 'success');
    } catch (e) {
      showToast('Erro ao salvar setores: ' + e.message, 'error');
    }
  };

  renderStep();
}

/* ============================================
   REAL-TIME SUBSCRIPTIONS
   ============================================ */
let _realtimeChannels = [];
let _renderDebounce = null;

function renderCurrentPage() {
  renderPage(App.state.currentPage);
}

function debouncedRender(page) {
  clearTimeout(_renderDebounce);
  _renderDebounce = setTimeout(() => {
    if (App.state.currentPage === page) renderCurrentPage();
  }, 300);
}

function notifyRealtime(payload, table) {
  const { eventType, new: record, old: oldRecord } = payload;
  if (eventType === 'INSERT') {
    if (table === 'tasks' && record.assignee === App.state.user?.id) {
      showNotificationPopup(`📋 Nova tarefa: <strong>${record.title}</strong>`, 'task');
    }
    if (table === 'notifications' && record.type) {
      showNotificationPopup(record.message, record.type);
    }
    if (table === 'meetings') {
      showNotificationPopup(`📅 Reunião: <strong>${record.title}</strong>`, 'meeting');
    }
  }
  if (table === 'notifications' || table === 'tasks' || table === 'meetings') {
    updateNotificationsBadge();
  }
}

async function setupRealtime() {
  // Clean up previous subscriptions
  _realtimeChannels.forEach(ch => sb.removeChannel(ch));
  _realtimeChannels = [];

  const tables = ['tasks', 'meetings', 'notifications', 'allocations', 'employees', 'meeting_participants', 'employee_schedules', 'sectors', 'recurrence_options'];
  const userId = App.state.user?.id;

  tables.forEach(table => {
    const channel = sb
      .channel(`public:${table}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table },
        (payload) => {
          // Invalidate cache for this table
          const cacheKey = {
            tasks: 'tasks', meetings: 'meetings', notifications: 'notifications',
            allocations: 'allocations', employees: 'employees',
            meeting_participants: 'participants', employee_schedules: 'schedules',
            sectors: 'sectors', recurrence_options: 'recurrenceOptions',
          }[table];
          if (cacheKey) invalidateCache(cacheKey);

          // Notify user
          notifyRealtime(payload, table);

          // Reload sectors/recurrence in memory when they change
          if (table === 'sectors') loadSectorsFromDB();
          if (table === 'recurrence_options') {
            getCachedRecurrenceOptions().then(opts => { App.state.recurrenceOptions = opts; });
          }

          // Re-render current page if needed
          const page = App.state.currentPage;
          debouncedRender(page);
        }
      )
      .subscribe();

    _realtimeChannels.push(channel);
  });

  // Connection status indicator via test channel
  let _testChannel = sb.channel('_conn_test');
  _testChannel.subscribe((status) => {
    const dot = document.getElementById('realtime-dot');
    if (!dot) return;
    const ok = status === 'SUBSCRIBED';
    dot.style.background = ok ? 'var(--green)' : 'var(--red)';
    dot.title = ok ? 'Conectado em tempo real' : 'Desconectado';
    if (ok) {
      // Fresh start: reload everything
      Object.keys(_cache).forEach(k => invalidateCache(k));
      renderCurrentPage();
    }
  });
  _realtimeChannels.push(_testChannel);

  // Fallback: full cache refresh every 30s to catch missed events
  setInterval(async () => {
    try {
      Object.keys(_cache).forEach(k => invalidateCache(k));
      await updateNotificationsBadge();
      renderCurrentPage();
    } catch (e) {}
  }, 30000);
}

function cleanupRealtime() {
  _realtimeChannels.forEach(ch => sb.removeChannel(ch));
  _realtimeChannels = [];
}

/* ============================================
   THEME TOGGLE
   ============================================ */
function updateThemeButtons(theme) {
  const el = document.getElementById('btn-login-theme');
  if (el) el.textContent = theme === 'dark' ? '🌙' : '☀️';
  const el2 = document.getElementById('btn-theme-toggle');
  if (el2) el2.textContent = theme === 'dark' ? '🌙' : '☀️';
}

function toggleTheme() {
  const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('ops-theme', theme);
  updateThemeButtons(theme);
}

function loadTheme() {
  const saved = localStorage.getItem('ops-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeButtons(saved);
}

/* ============================================
   BLOCK DEVTOOLS
   ============================================ */
function blockDevTools() {
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('keydown', e => {
    if (e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['I','J','C'].includes(e.key.toUpperCase())) ||
        (e.ctrlKey && e.key.toUpperCase() === 'U')) {
      e.preventDefault();
    }
  });
}

/* ============================================
   INIT
   ============================================ */
(async function init() {
  blockDevTools();
  loadTheme();
  setupEvents();
  setupSearch();
  setupToggleSidebar();

  // Check if user has an active Supabase session (persists across tabs)
  const hasSession = await checkExistingSession();

  if (hasSession) {
    // Load sectors + recurrence (needed for rendering)
    try {
      await loadSectorsFromDB();
      const recOpts = await getCachedRecurrenceOptions();
      if (recOpts && recOpts.length > 0) App.state.recurrenceOptions = recOpts;
    } catch (e) { /* background load fail */ }
  }
})();
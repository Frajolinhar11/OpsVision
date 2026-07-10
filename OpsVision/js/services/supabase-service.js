/* ============================================
   OPS VISION - Supabase Data Service (SaaS)
   Uses Supabase Auth + company tenant isolation
   ============================================ */

let _companyId = null;

const db = {
  // ============================================
  // AUTH (Supabase Auth)
  // ============================================
  setCompanyId(id) { _companyId = id; },
  getCompanyId() { return _companyId; },

  async login(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error || !data.user) return null;
    // Fetch profile (avoid RLS join issues)
    const { data: profile, error: pErr } = await sb
      .from('users')
      .select('*')
      .eq('auth_id', data.user.id)
      .single();
    if (pErr || !profile) return null;
    _companyId = profile.company_id;
    // Fetch company name separately
    let companyName = '', companyCode = '';
    try {
      const { data: comp } = await sb.from('companies').select('name,slug').eq('id', _companyId).single();
      if (comp) { companyName = comp.name; companyCode = comp.slug; }
    } catch (e) {}
    return {
      id: profile.id,
      auth_id: profile.auth_id,
      company_id: profile.company_id,
      company_name: companyName,
      company_code: companyCode,
      name: profile.name,
      type: profile.type,
      role: profile.role,
      initials: profile.initials,
      email: profile.email,
    };
  },

  async signupEmployee(email, password, name, companyId, empId, type = 'funcionario') {
    try {
      const { data, error } = await sb.rpc('create_user_rpc_for_employee', {
        p_email: email,
        p_password: password,
        p_name: name,
        p_company_id: companyId,
        p_employee_id: empId,
        p_type: type,
      });
      if (error) return { error: 'RPC ' + (error.message || JSON.stringify(error) || 'erro desconhecido (rode o SQL 007 primeiro)') };
      if (data && data.error) return { error: data.error };
      return { user: { id: empId, email } };
    } catch (e) {
      return { error: e.message || JSON.stringify(e) };
    }
  },

  async signup(email, password, name, companyId, type = 'gestor') {
    try {
      // Create auth user + profile in one RPC call (bypasses rate limit)
      const { data, error } = await sb.rpc('create_user_rpc', {
        p_email: email,
        p_password: password,
        p_name: name,
        p_company_id: companyId,
        p_type: type,
      });
      if (error) return { error: 'RPC ' + (error.message || JSON.stringify(error) || 'erro desconhecido (rode o SQL 007 primeiro)') };
      if (data && data.error) return { error: data.error };
      return { user: { id: data.auth_id, email } };
    } catch (e) {
      return { error: e.message || JSON.stringify(e) };
    }
  },

  async createCompany(name) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const id = uid();
    const { error } = await sb.from('companies').insert({ id, name, slug: code });
    if (error) return { error: error.message };
    return { company: { id, name, code } };
  },

  async logout() {
    _companyId = null;
    await sb.auth.signOut();
  },

  async getSession() {
    const { data } = await sb.auth.getSession();
    if (!data.session) return null;
    // Try to find existing profile
    let { data: profiles } = await sb
      .from('users')
      .select('*')
      .eq('auth_id', data.session.user.id);
    let profile = profiles && profiles[0] ? profiles[0] : null;
    // If no profile (new OAuth user), create one with default company
    if (!profile) {
      const userMeta = data.session.user.user_metadata || {};
      const userEmail = data.session.user.email || '';
      const userName = userMeta.full_name || userMeta.name || userEmail.split('@')[0] || 'User';
      // Find default company
      let { data: companies } = await sb.from('companies').select('id').limit(1);
      let defaultCompany = companies && companies[0] ? companies[0] : null;
      if (!defaultCompany) {
        // Create default company
        const cId = uid();
        await sb.from('companies').insert({ id: cId, name: 'Minha Empresa', slug: 'minha-empresa-' + Date.now().toString(36) });
        defaultCompany = { id: cId };
      }
      // Create profile via RPC
      const { data: newId } = await sb.rpc('create_user_profile', {
        p_auth_id: data.session.user.id,
        p_company_id: defaultCompany.id,
        p_name: userName,
        p_type: 'gestor',
        p_email: userEmail,
      });
      profile = {
        id: newId,
        auth_id: data.session.user.id,
        company_id: defaultCompany.id,
        name: userName,
        type: 'gestor',
        role: '',
        initials: userName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2),
        email: userEmail,
      };
    }
    _companyId = profile.company_id;
    let companyName = '', companyCode = '';
    try {
      const { data: comp } = await sb.from('companies').select('name,slug').eq('id', _companyId).single();
      if (comp) { companyName = comp.name; companyCode = comp.slug; }
    } catch (e) {}
    return {
      id: profile.id,
      auth_id: profile.auth_id,
      company_id: profile.company_id,
      company_name: companyName,
      company_code: companyCode,
      name: profile.name,
      type: profile.type,
      role: profile.role,
      initials: profile.initials,
      email: profile.email,
    };
  },

  // ============================================
  // EMPLOYEES
  // ============================================
  async getEmployees() {
    if (!_companyId) return [];
    const { data, error } = await sb
      .from('employees')
      .select('*')
      .eq('company_id', _companyId)
      .order('id');
    if (error) throw error;
    return data || [];
  },
  async getEmployee(id) {
    const { data, error } = await sb
      .from('employees').select('*')
      .eq('company_id', _companyId).eq('id', id).single();
    if (error) return null;
    return data;
  },
  async insertEmployee(emp) {
    emp.company_id = _companyId;
    const { data, error } = await sb.from('employees').insert(emp).select().single();
    if (error) throw error;
    return data;
  },
  async updateEmployee(id, updates) {
    const { data, error } = await sb.from('employees').update(updates)
      .eq('company_id', _companyId).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  async deleteEmployee(id) {
    const { error } = await sb.from('employees').delete()
      .eq('company_id', _companyId).eq('id', id);
    if (error) throw error;
  },

  // ============================================
  // TASKS
  // ============================================
  async getTasks() {
    const { data, error } = await sb.from('tasks').select('*')
      .eq('company_id', _companyId).order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async getTask(id) {
    const { data, error } = await sb.from('tasks').select('*')
      .eq('company_id', _companyId).eq('id', id).single();
    if (error) return null;
    return data;
  },
  async insertTask(task) {
    task.company_id = _companyId;
    const { data, error } = await sb.from('tasks').insert(task).select().single();
    if (error) throw error;
    return data;
  },
  async updateTask(id, updates) {
    const { data, error } = await sb.from('tasks').update(updates)
      .eq('company_id', _companyId).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  async deleteTask(id) {
    const { error } = await sb.from('tasks').delete()
      .eq('company_id', _companyId).eq('id', id);
    if (error) throw error;
  },
  async executeTask(id, status, evidence) {
    const updates = {
      status,
      evidence_photo: evidence.photo || '',
      evidence_description: evidence.description || '',
      evidence_timestamp: evidence.timestamp || new Date().toISOString(),
    };
    const { data, error } = await sb.from('tasks').update(updates)
      .eq('company_id', _companyId).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  // ============================================
  // MEETINGS
  // ============================================
  async getMeetings() {
    const { data, error } = await sb.from('meetings').select('*')
      .eq('company_id', _companyId).order('date');
    if (error) throw error;
    return data || [];
  },
  async getMeeting(id) {
    const { data, error } = await sb.from('meetings').select('*')
      .eq('company_id', _companyId).eq('id', id).single();
    if (error) return null;
    return data;
  },
  async insertMeeting(m) {
    m.company_id = _companyId;
    const { data, error } = await sb.from('meetings').insert(m).select().single();
    if (error) throw error;
    return data;
  },
  async updateMeeting(id, updates) {
    const { data, error } = await sb.from('meetings').update(updates)
      .eq('company_id', _companyId).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  async deleteMeeting(id) {
    const { error } = await sb.from('meetings').delete()
      .eq('company_id', _companyId).eq('id', id);
    if (error) throw error;
  },

  // ============================================
  // MEETING PARTICIPANTS
  // ============================================
  async getParticipants(meetingId) {
    const { data, error } = await sb.from('meeting_participants').select('*')
      .eq('company_id', _companyId).eq('meeting_id', meetingId);
    if (error) throw error;
    return data || [];
  },
  async getAllParticipants() {
    const { data, error } = await sb.from('meeting_participants').select('*')
      .eq('company_id', _companyId);
    if (error) throw error;
    return data || [];
  },
  async insertParticipant(p) {
    p.company_id = _companyId;
    const { data, error } = await sb.from('meeting_participants').insert(p).select().single();
    if (error) throw error;
    return data;
  },
  async updateParticipant(id, updates) {
    const { data, error } = await sb.from('meeting_participants').update(updates)
      .eq('company_id', _companyId).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  async bulkInsertParticipants(participants) {
    participants.forEach(p => p.company_id = _companyId);
    const { data, error } = await sb.from('meeting_participants').insert(participants).select();
    if (error) throw error;
    return data || [];
  },
  async deleteParticipantsByMeeting(meetingId) {
    const { error } = await sb.from('meeting_participants').delete()
      .eq('company_id', _companyId).eq('meeting_id', meetingId);
    if (error) throw error;
  },

  // ============================================
  // NOTIFICATIONS
  // ============================================
  async getNotifications() {
    const { data, error } = await sb.from('notifications').select('*')
      .eq('company_id', _companyId).order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async insertNotification(n) {
    n.company_id = _companyId;
    const { data, error } = await sb.from('notifications').insert(n).select().single();
    if (error) throw error;
    return data;
  },
  async markNotificationRead(id) {
    const { error } = await sb.from('notifications').update({ read: true })
      .eq('company_id', _companyId).eq('id', id);
    if (error) throw error;
  },
  async markAllNotificationsRead() {
    const { error } = await sb.from('notifications').update({ read: true })
      .eq('company_id', _companyId).eq('read', false);
    if (error) throw error;
  },
  async deleteNotification(id) {
    const { error } = await sb.from('notifications').delete()
      .eq('company_id', _companyId).eq('id', id);
    if (error) throw error;
  },

  // ============================================
  // ALLOCATIONS
  // ============================================
  async getAllocations() {
    const { data, error } = await sb.from('allocations').select('*')
      .eq('company_id', _companyId).order('allocated_at');
    if (error) throw error;
    return data || [];
  },
  async insertAllocation(a) {
    a.company_id = _companyId;
    const { data, error } = await sb.from('allocations').insert(a).select().single();
    if (error) throw error;
    return data;
  },
  async deleteAllocation(id) {
    const { error } = await sb.from('allocations').delete()
      .eq('company_id', _companyId).eq('id', id);
    if (error) throw error;
  },
  async deleteAllocationsForDay(employee_id, dateStr) {
    const { data, error } = await sb.from('allocations').delete()
      .eq('company_id', _companyId).eq('employee_id', employee_id)
      .gte('allocated_at', dateStr + 'T00:00:00Z')
      .lte('allocated_at', dateStr + 'T23:59:59Z');
    if (error) throw error;
    return data;
  },

  // ============================================
  // STORAGE
  // ============================================
  async uploadPhoto(employeeId, file) {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `company_${_companyId}/employee_${employeeId}/${Date.now()}.${ext}`;
    const { data, error } = await sb.storage.from('evidence-photos')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    const { data: urlData } = sb.storage.from('evidence-photos').getPublicUrl(path);
    return urlData.publicUrl;
  },
  async deletePhoto(path) {
    const { error } = await sb.storage.from('evidence-photos').remove([path]);
    if (error) throw error;
  },

  // ============================================
  // EMPLOYEE SCHEDULES
  // ============================================
  async getSchedules() {
    const { data, error } = await sb.from('employee_schedules').select('*')
      .eq('company_id', _companyId).order('start_date');
    if (error) throw error;
    return data || [];
  },
  async upsertSchedule(s) {
    s.company_id = _companyId;
    const { data, error } = await sb.from('employee_schedules')
      .upsert(s, { onConflict: ['employee_id', 'start_date'] }).select().single();
    if (error) throw error;
    return data;
  },
  async deleteSchedule(id) {
    const { error } = await sb.from('employee_schedules').delete()
      .eq('company_id', _companyId).eq('id', id);
    if (error) throw error;
  },
  async insertSchedule(s) {
    s.company_id = _companyId;
    const { data, error } = await sb.from('employee_schedules').insert(s).select().single();
    if (error) throw error;
    return data;
  },
  async updateSchedule(id, updates) {
    const { data, error } = await sb.from('employee_schedules').update(updates)
      .eq('company_id', _companyId).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  // ============================================
  // SECTORS
  // ============================================
  async getSectors() {
    const { data, error } = await sb.from('sectors').select('*')
      .eq('company_id', _companyId).order('id');
    if (error) throw error;
    return data || [];
  },
  async insertSector(s) {
    s.company_id = _companyId;
    const { data, error } = await sb.from('sectors').insert(s).select().single();
    if (error) throw error;
    return data;
  },
  async updateSector(id, updates) {
    const { data, error } = await sb.from('sectors').update(updates)
      .eq('company_id', _companyId).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  async deleteSector(id) {
    const { error } = await sb.from('sectors').delete()
      .eq('company_id', _companyId).eq('id', id);
    if (error) throw error;
  },

  // ============================================
  // RECURRENCE OPTIONS
  // ============================================
  async getRecurrenceOptions() {
    const { data, error } = await sb.from('recurrence_options').select('*')
      .eq('company_id', _companyId).order('sort_order');
    if (error) throw error;
    return data || [];
  },
  async insertRecurrenceOption(o) {
    o.company_id = _companyId;
    const { data, error } = await sb.from('recurrence_options').insert(o).select().single();
    if (error) throw error;
    return data;
  },
  async updateRecurrenceOption(id, updates) {
    const { data, error } = await sb.from('recurrence_options').update(updates)
      .eq('company_id', _companyId).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  async deleteRecurrenceOption(id) {
    const { error } = await sb.from('recurrence_options').delete()
      .eq('company_id', _companyId).eq('id', id);
    if (error) throw error;
  },

  // ============================================
  // COMPANY ADMIN
  // ============================================
  async getCompanyUsers() {
    const { data, error } = await sb.from('users').select('*')
      .eq('company_id', _companyId).order('id');
    if (error) throw error;
    return data || [];
  },
  async updateUser(id, updates) {
    const { data, error } = await sb.from('users').update(updates)
      .eq('company_id', _companyId).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
};

function uid() {
  return Date.now() + Math.floor(Math.random() * 1000);
}

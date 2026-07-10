/* ============================================
   OPS VISION - Supabase Data Service
   All database operations abstracted here
   ============================================ */

const db = {
  // ============================================
  // USERS (custom auth)
  // ============================================
  async login(username, password) {
    const { data, error } = await sb
      .from('users')
      .select('*')
      .eq('username', username)
      .eq('password', password)
      .single();
    if (error || !data) return null;
    return data;
  },

  // ============================================
  // EMPLOYEES
  // ============================================
  async getEmployees() {
    const { data, error } = await sb
      .from('employees')
      .select('*')
      .order('id', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async getEmployee(id) {
    const { data, error } = await sb
      .from('employees')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return data;
  },

  async insertEmployee(employee) {
    const { data, error } = await sb
      .from('employees')
      .insert(employee)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateEmployee(id, updates) {
    const { data, error } = await sb
      .from('employees')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteEmployee(id) {
    const { error } = await sb
      .from('employees')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // ============================================
  // TASKS
  // ============================================
  async getTasks() {
    const { data, error } = await sb
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getTask(id) {
    const { data, error } = await sb
      .from('tasks')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return data;
  },

  async insertTask(task) {
    const { data, error } = await sb
      .from('tasks')
      .insert(task)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateTask(id, updates) {
    const { data, error } = await sb
      .from('tasks')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteTask(id) {
    const { error } = await sb
      .from('tasks')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  async executeTask(id, status, evidence) {
    const updates = {
      status,
      evidence_photo: evidence.photo || '',
      evidence_description: evidence.description || '',
      evidence_timestamp: evidence.timestamp || new Date().toISOString(),
    };
    const { data, error } = await sb
      .from('tasks')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // ============================================
  // MEETINGS
  // ============================================
  async getMeetings() {
    const { data, error } = await sb
      .from('meetings')
      .select('*')
      .order('date', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async getMeeting(id) {
    const { data, error } = await sb
      .from('meetings')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return data;
  },

  async insertMeeting(meeting) {
    const { data, error } = await sb
      .from('meetings')
      .insert(meeting)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateMeeting(id, updates) {
    const { data, error } = await sb
      .from('meetings')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteMeeting(id) {
    const { error } = await sb
      .from('meetings')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // ============================================
  // MEETING PARTICIPANTS
  // ============================================
  async getParticipants(meetingId) {
    const { data, error } = await sb
      .from('meeting_participants')
      .select('*')
      .eq('meeting_id', meetingId);
    if (error) throw error;
    return data || [];
  },

  async getAllParticipants() {
    const { data, error } = await sb
      .from('meeting_participants')
      .select('*');
    if (error) throw error;
    return data || [];
  },

  async insertParticipant(participant) {
    const { data, error } = await sb
      .from('meeting_participants')
      .insert(participant)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateParticipant(id, updates) {
    const { data, error } = await sb
      .from('meeting_participants')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async bulkInsertParticipants(participants) {
    const { data, error } = await sb
      .from('meeting_participants')
      .insert(participants)
      .select();
    if (error) throw error;
    return data || [];
  },

  async deleteParticipantsByMeeting(meetingId) {
    const { error } = await sb
      .from('meeting_participants')
      .delete()
      .eq('meeting_id', meetingId);
    if (error) throw error;
  },

  // ============================================
  // NOTIFICATIONS
  // ============================================
  async getNotifications() {
    const { data, error } = await sb
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async insertNotification(notification) {
    const { data, error } = await sb
      .from('notifications')
      .insert(notification)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async markNotificationRead(id) {
    const { error } = await sb
      .from('notifications')
      .update({ read: true })
      .eq('id', id);
    if (error) throw error;
  },

  async markAllNotificationsRead() {
    const { error } = await sb
      .from('notifications')
      .update({ read: true })
      .eq('read', false);
    if (error) throw error;
  },

  async deleteNotification(id) {
    const { error } = await sb
      .from('notifications')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // ============================================
  // ALLOCATIONS
  // ============================================
  async getAllocations() {
    const { data, error } = await sb
      .from('allocations')
      .select('*')
      .order('allocated_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async insertAllocation(allocation) {
    const { data, error } = await sb
      .from('allocations')
      .insert(allocation)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteAllocation(id) {
    const { error } = await sb
      .from('allocations')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  async deleteAllocationsForDay(employee_id, dateStr) {
    const { data, error } = await sb
      .from('allocations')
      .delete()
      .eq('employee_id', employee_id)
      .gte('allocated_at', dateStr + 'T00:00:00Z')
      .lte('allocated_at', dateStr + 'T23:59:59Z');
    if (error) throw error;
    return data;
  },

  // ============================================
  // STORAGE (evidence photos)
  // ============================================
  async uploadPhoto(employeeId, file) {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `employee_${employeeId}/${Date.now()}.${ext}`;
    const { data, error } = await sb.storage
      .from('evidence-photos')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    const { data: urlData } = sb.storage
      .from('evidence-photos')
      .getPublicUrl(path);
    return urlData.publicUrl;
  },

  async deletePhoto(path) {
    const { error } = await sb.storage
      .from('evidence-photos')
      .remove([path]);
    if (error) throw error;
  },

  // ============================================
  // EMPLOYEE SCHEDULES
  // ============================================
  async getSchedules() {
    const { data, error } = await sb
      .from('employee_schedules')
      .select('*')
      .order('start_date', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async upsertSchedule(schedule) {
    const { data, error } = await sb
      .from('employee_schedules')
      .upsert(schedule, { onConflict: ['employee_id', 'start_date'] })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteSchedule(id) {
    const { error } = await sb
      .from('employee_schedules')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  async insertSchedule(schedule) {
    const { data, error } = await sb
      .from('employee_schedules')
      .insert(schedule)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateSchedule(id, updates) {
    const { data, error } = await sb
      .from('employee_schedules')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // ============================================
  // SECTORS
  // ============================================
  async getSectors() {
    const { data, error } = await sb
      .from('sectors')
      .select('*')
      .order('id', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async insertSector(sector) {
    const { data, error } = await sb
      .from('sectors')
      .insert(sector)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateSector(id, updates) {
    const { data, error } = await sb
      .from('sectors')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteSector(id) {
    const { error } = await sb
      .from('sectors')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // ============================================
  // RECURRENCE OPTIONS
  // ============================================
  async getRecurrenceOptions() {
    const { data, error } = await sb
      .from('recurrence_options')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async insertRecurrenceOption(opt) {
    const { data, error } = await sb
      .from('recurrence_options')
      .insert(opt)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateRecurrenceOption(id, updates) {
    const { data, error } = await sb
      .from('recurrence_options')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteRecurrenceOption(id) {
    const { error } = await sb
      .from('recurrence_options')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },
};

function uid() {
  return Date.now() + Math.floor(Math.random() * 1000);
}
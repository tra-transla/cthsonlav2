
import { createClient } from '@supabase/supabase-js';
import { Meeting, Unit, Staff, Endpoint, User, SystemSettings, ParticipantGroup, EndpointStatus } from '../types';

const getEnv = (key: string) => {
  // Prioritize Vite's import.meta.env (handles .env and Vercel/Cloud environment variables)
  const viteKey = `VITE_${key}`;
  let envValue = "";
  try {
    envValue = (import.meta as any).env?.[viteKey] || (import.meta as any).env?.[key];
  } catch (e) {
    // import.meta might not be available
  }
  
  if (envValue) return envValue;

  // Fallback to window.process.env shim
  try {
    return (window as any).process?.env?.[key] || "";
  } catch (e) {
    return "";
  }
};

const supabaseUrl = getEnv('SUPABASE_URL');
const supabaseAnonKey = getEnv('SUPABASE_ANON_KEY');

console.log("Supabase Service Initializing with URL:", supabaseUrl);

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase credentials missing. Check environment variables (SUPABASE_URL, SUPABASE_ANON_KEY).");
}

export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

/**
 * Hàm hỗ trợ Upsert an toàn: Tự động loại bỏ các cột không tồn tại trong Database và thử lại.
 */
async function safeUpsert(table: string, payload: any) {
  if (!supabase) return;
  
  try {
    const { error } = await supabase.from(table).upsert(payload);
    if (!error) return;

    // Kiểm tra nếu lỗi là do thiếu cột trong Schema
    const errorMsg = error.message || "";
    if (
      errorMsg.includes('column') || 
      errorMsg.includes('does not exist') || 
      errorMsg.includes('schema cache')
    ) {
      console.warn(`Supabase Schema Mismatch in table "${table}":`, errorMsg);
      
      // Cố gắng trích xuất tên cột bị thiếu từ thông báo lỗi
      // Định dạng 1: column "xyz" of relation "abc" does not exist
      // Định dạng 2: Could not find the 'xyz' column of 'abc' in the schema cache
      const match = errorMsg.match(/column "([^"]+)"/) || errorMsg.match(/the '([^']+)' column/);
      
      if (match && match[1]) {
        const missingColumn = match[1];
        console.info(`Retrying upsert to "${table}" without missing column: ${missingColumn}`);
        const { [missingColumn]: _, ...newPayload } = payload;
        return safeUpsert(table, newPayload); // Đệ quy thử lại với payload đã lọc
      }
      
      // Nếu không bắt được tên cột cụ thể nhưng biết là lỗi schema, thử bỏ qua updated_at nếu có
      if (payload.updated_at) {
        console.info(`Retrying upsert to "${table}" without updated_at...`);
        const { updated_at, ...fallbackPayload } = payload;
        return safeUpsert(table, fallbackPayload);
      }
    }
    
    throw error;
  } catch (err) {
    console.error(`Final error in safeUpsert for table "${table}":`, err);
    throw err;
  }
}

// --- MAPPERS: Chuyển đổi snake_case (DB) <-> camelCase (App) ---

const mapMeeting = (m: any): Meeting => ({
  id: m.id,
  title: m.title || 'Không có tiêu đề',
  hostUnit: m.host_unit_name || m.host_unit || m.hostUnit || 'N/A',
  hostUnitId: m.host_unit_id || m.hostUnitId || null,
  chairPerson: m.chair_person_name || m.chair_person || m.chairPerson || 'N/A',
  chairPersonId: m.chair_person_id || m.chairPersonId || null,
  startTime: m.start_time || m.startTime || new Date().toISOString(),
  endTime: m.end_time || m.endTime || new Date().toISOString(),
  description: m.description || '',
  participants: Array.isArray(m.participants) ? m.participants : [],
  endpoints: Array.isArray(m.endpoints) ? m.endpoints : [],
  notes: m.notes || '',
  endpointChecks: m.endpoint_checks || m.endpointChecks || {},
  status: m.status || 'SCHEDULED',
  cancelReason: m.cancel_reason || m.cancelReason || '',
  invitationLink: m.invitation_link || m.invitationLink || '',
  updatedAt: m.updated_at || m.updatedAt || null
});

const unmapMeeting = (m: Meeting) => ({
  id: m.id,
  title: m.title,
  host_unit_name: m.hostUnit,
  host_unit_id: m.hostUnitId || null,
  chair_person_name: m.chairPerson,
  chair_person_id: m.chairPersonId || null,
  start_time: m.startTime,
  end_time: m.endTime,
  description: m.description || '',
  participants: Array.isArray(m.participants) ? m.participants : [],
  endpoints: Array.isArray(m.endpoints) ? m.endpoints : [],
  notes: m.notes || null,
  endpoint_checks: m.endpointChecks || {},
  status: m.status || 'SCHEDULED',
  cancel_reason: m.cancelReason || null,
  invitation_link: m.invitationLink || null,
  updated_at: new Date().toISOString()
});

const mapEndpoint = (e: any): Endpoint => ({
  id: e.id,
  name: e.name || 'N/A',
  location: e.location || 'N/A',
  status: (e.status as EndpointStatus) || EndpointStatus.DISCONNECTED,
  lastConnected: e.last_connected || e.lastConnected || 'N/A',
  updatedAt: e.updated_at || e.updatedAt || null
});

const mapStaff = (s: any): Staff => ({
  id: s.id,
  fullName: s.full_name || s.fullName || 'N/A',
  unitId: s.unit_id || s.unitId || '',
  position: s.position || 'Cán bộ',
  email: s.email || '',
  phone: s.phone || '',
  updatedAt: s.updated_at || s.updatedAt || null
});

const unmapStaff = (s: Staff) => ({
  id: s.id,
  full_name: s.fullName,
  unit_id: s.unitId,
  position: s.position,
  email: s.email,
  phone: s.phone,
  updated_at: new Date().toISOString()
});

const mapUnit = (u: any): Unit => ({
  id: u.id,
  name: u.name || 'N/A',
  code: u.code || 'N/A',
  description: u.description || '',
  updatedAt: u.updated_at || u.updatedAt || null
});

const unmapUnit = (u: Unit) => ({
  id: u.id,
  name: u.name,
  code: u.code,
  description: u.description,
  updated_at: new Date().toISOString()
});

const mapUser = (u: any): User => ({
  id: u.id,
  username: u.username,
  fullName: u.full_name || u.fullName || 'N/A',
  role: u.role,
  password: u.password,
  updatedAt: u.updated_at || u.updatedAt || null
});

const unmapUser = (u: User) => ({
  id: u.id,
  username: u.username,
  full_name: u.fullName,
  role: u.role,
  password: u.password,
  updated_at: new Date().toISOString()
});

const mapSettings = (s: any): SystemSettings => ({
  systemName: s.system_name || s.systemName || '',
  shortName: s.short_name || s.shortName || '',
  logoBase64: s.logo_base_64 || s.logoBase64 || '',
  primaryColor: s.primary_color || s.primaryColor || '#3B82F6',
  updatedAt: s.updated_at || s.updatedAt || null
});

const unmapSettings = (s: SystemSettings) => ({
  id: 1,
  system_name: s.systemName,
  short_name: s.shortName,
  logo_base_64: s.logoBase64,
  primary_color: s.primaryColor,
  updated_at: new Date().toISOString()
});

export const supabaseService = {
  isConfigured: () => !!supabase,

  async testConnection() {
    if (!supabase) return { success: false, message: "Supabase client not initialized" };
    try {
      const { data, error } = await supabase.from('system_settings').select('id').limit(1);
      if (error) throw error;
      return { success: true, message: "Connected to Supabase successfully", data };
    } catch (err: any) {
      console.error("Supabase connection test failed:", err);
      return { success: false, message: err.message || "Unknown error connecting to Supabase" };
    }
  },

  async getMeetings(): Promise<Meeting[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.from('meetings').select('*').order('start_time', { ascending: false });
    if (error) {
      console.error("Supabase error fetching meetings:", error);
      return [];
    }
    return (data || []).map(mapMeeting);
  },

  async upsertMeeting(m: Meeting) {
    const payload = unmapMeeting(m);
    console.log("Attempting to upsert meeting:", payload.id);
    await safeUpsert('meetings', payload);
    console.log("Upsert successful:", payload.id);
  },

  async deleteMeeting(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from('meetings').delete().eq('id', id);
    if (error) throw error;
  },

  async getEndpoints(): Promise<Endpoint[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.from('endpoints').select('*').order('name');
    if (error) return [];
    return (data || []).map(mapEndpoint);
  },

  async upsertEndpoint(e: Endpoint) {
    const payload: any = {
      id: e.id,
      name: e.name,
      location: e.location,
      status: e.status,
      last_connected: e.lastConnected,
      updated_at: new Date().toISOString()
    };
    await safeUpsert('endpoints', payload);
  },

  async deleteEndpoint(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from('endpoints').delete().eq('id', id);
    if (error) throw error;
  },

  async getUnits(): Promise<Unit[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.from('units').select('*').order('name');
    if (error) return [];
    return (data || []).map(mapUnit);
  },

  async upsertUnit(u: Unit) {
    const payload = unmapUnit(u);
    await safeUpsert('units', payload);
  },

  async deleteUnit(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from('units').delete().eq('id', id);
    if (error) throw error;
  },

  async getStaff(): Promise<Staff[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.from('staff').select('*').order('full_name');
    if (error) return [];
    return (data || []).map(mapStaff);
  },

  async upsertStaff(s: Staff) {
    const payload = unmapStaff(s);
    await safeUpsert('staff', payload);
  },

  async deleteStaff(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from('staff').delete().eq('id', id);
    if (error) throw error;
  },

  async getGroups(): Promise<ParticipantGroup[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.from('participant_groups').select('*').order('name');
    return data || [];
  },

  async upsertGroup(g: ParticipantGroup) {
    const payload = { ...g, updated_at: new Date().toISOString() };
    await safeUpsert('participant_groups', payload);
  },

  async deleteGroup(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from('participant_groups').delete().eq('id', id);
    if (error) throw error;
  },

  async getUsers(): Promise<User[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.from('users').select('*').order('username');
    if (error) return [];
    return (data || []).map(mapUser);
  },

  async upsertUser(u: User) {
    const payload = unmapUser(u);
    await safeUpsert('users', payload);
  },

  async deleteUser(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) throw error;
  },

  async getSettings(): Promise<SystemSettings | null> {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase.from('system_settings').select('*').single();
      if (error) {
        console.warn("Supabase: Error fetching system_settings (might not exist yet):", error.message);
        return null;
      }
      return mapSettings(data);
    } catch (err) {
      console.error("Supabase: Unexpected error in getSettings:", err);
      return null;
    }
  },

  async updateSettings(s: SystemSettings) {
    const payload = unmapSettings(s);
    await safeUpsert('system_settings', payload);
  },

  subscribeTable(table: string, callback: (payload: any) => void) {
    if (!supabase) return null;
    return supabase
      .channel(`public:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
        let mappedData = payload.new;
        if (payload.new) {
          if (table === 'meetings') mappedData = mapMeeting(payload.new);
          else if (table === 'endpoints') mappedData = mapEndpoint(payload.new);
          else if (table === 'staff') mappedData = mapStaff(payload.new);
          else if (table === 'units') mappedData = mapUnit(payload.new);
          else if (table === 'users') mappedData = mapUser(payload.new);
          else if (table === 'system_settings') mappedData = mapSettings(payload.new);
        }
        callback({ ...payload, mappedData });
      })
      .subscribe();
  }
};

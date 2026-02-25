
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

const isValidUrl = (url: string) => {
  try {
    new URL(url);
    return url.startsWith('http');
  } catch (e) {
    return false;
  }
};

const supabaseUrl = getEnv('SUPABASE_URL');
const supabaseAnonKey = getEnv('SUPABASE_ANON_KEY');

// Only initialize Supabase if the URL looks valid and is not a placeholder
export const supabase = (supabaseUrl && isValidUrl(supabaseUrl) && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

let useLocalFallback = !supabase;

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

// --- LOCAL BACKEND FALLBACK ---
const localApi = {
  async get(table: string) {
    try {
      const res = await fetch(`/api/db/${table}`);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return res.json();
    } catch (e) {
      console.error(`Local API GET error for ${table}:`, e);
      throw e;
    }
  },
  async post(table: string, data: any) {
    try {
      const res = await fetch(`/api/db/${table}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return res.json();
    } catch (e) {
      console.error(`Local API POST error for ${table}:`, e);
      throw e;
    }
  },
  async delete(table: string, id: string) {
    try {
      const res = await fetch(`/api/db/${table}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return res.json();
    } catch (e) {
      console.error(`Local API DELETE error for ${table}:`, e);
      throw e;
    }
  },
  async getSettings() {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return res.json();
    } catch (e) {
      console.error(`Local API GET settings error:`, e);
      throw e;
    }
  },
  async postSettings(data: any) {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return res.json();
    } catch (e) {
      console.error(`Local API POST settings error:`, e);
      throw e;
    }
  },
  async checkHealth() {
    try {
      const res = await fetch('/api/health');
      return res.ok;
    } catch (e) {
      return false;
    }
  }
};

export const supabaseService = {
  isConfigured: () => !!supabase && !useLocalFallback,
  isLocal: () => useLocalFallback,

  async testConnection() {
    if (!supabase) {
      const isLocalHealthy = await localApi.checkHealth();
      if (isLocalHealthy) {
        useLocalFallback = true;
        return { success: true, message: "Using Local Backend" };
      } else {
        return { success: false, message: "Local Backend unreachable. Make sure server is running." };
      }
    }
    
    try {
      const { data, error } = await supabase.from('system_settings').select('id').limit(1);
      if (error) throw error;
      useLocalFallback = false;
      return { success: true, message: "Connected to Supabase successfully", data };
    } catch (err: any) {
      console.warn("Supabase connection failed, falling back to local:", err.message);
      const isLocalHealthy = await localApi.checkHealth();
      if (isLocalHealthy) {
        useLocalFallback = true;
        return { success: true, message: "Supabase failed, using Local Backend fallback" };
      }
      return { success: false, message: `Supabase Error: ${err.message}. Local Backend also unreachable.` };
    }
  },

  async getMeetings(): Promise<Meeting[]> {
    if (useLocalFallback) return localApi.get('meetings');
    const { data, error } = await supabase!.from('meetings').select('*').order('start_time', { ascending: false });
    if (error) {
      console.error("Supabase error fetching meetings:", error);
      return localApi.get('meetings'); // Fallback on error
    }
    return (data || []).map(mapMeeting);
  },

  async upsertMeeting(m: Meeting) {
    if (useLocalFallback) return localApi.post('meetings', m);
    const payload = unmapMeeting(m);
    try {
      await safeUpsert('meetings', payload);
    } catch (e) {
      return localApi.post('meetings', m);
    }
  },

  async deleteMeeting(id: string) {
    if (useLocalFallback) return localApi.delete('meetings', id);
    const { error } = await supabase!.from('meetings').delete().eq('id', id);
    if (error) return localApi.delete('meetings', id);
  },

  async getEndpoints(): Promise<Endpoint[]> {
    if (useLocalFallback) return localApi.get('endpoints');
    const { data, error } = await supabase!.from('endpoints').select('*').order('name');
    if (error) return localApi.get('endpoints');
    return (data || []).map(mapEndpoint);
  },

  async upsertEndpoint(e: Endpoint) {
    if (useLocalFallback) return localApi.post('endpoints', e);
    const payload: any = {
      id: e.id,
      name: e.name,
      location: e.location,
      status: e.status,
      last_connected: e.lastConnected,
      updated_at: new Date().toISOString()
    };
    try {
      await safeUpsert('endpoints', payload);
    } catch (err) {
      return localApi.post('endpoints', e);
    }
  },

  async deleteEndpoint(id: string) {
    if (useLocalFallback) return localApi.delete('endpoints', id);
    const { error } = await supabase!.from('endpoints').delete().eq('id', id);
    if (error) return localApi.delete('endpoints', id);
  },

  async getUnits(): Promise<Unit[]> {
    if (useLocalFallback) return localApi.get('units');
    const { data, error } = await supabase!.from('units').select('*').order('name');
    if (error) return localApi.get('units');
    return (data || []).map(mapUnit);
  },

  async upsertUnit(u: Unit) {
    if (useLocalFallback) return localApi.post('units', u);
    const payload = unmapUnit(u);
    try {
      await safeUpsert('units', payload);
    } catch (e) {
      return localApi.post('units', u);
    }
  },

  async deleteUnit(id: string) {
    if (useLocalFallback) return localApi.delete('units', id);
    const { error } = await supabase!.from('units').delete().eq('id', id);
    if (error) return localApi.delete('units', id);
  },

  async getStaff(): Promise<Staff[]> {
    if (useLocalFallback) return localApi.get('staff');
    const { data, error } = await supabase!.from('staff').select('*').order('full_name');
    if (error) return localApi.get('staff');
    return (data || []).map(mapStaff);
  },

  async upsertStaff(s: Staff) {
    if (useLocalFallback) return localApi.post('staff', s);
    const payload = unmapStaff(s);
    try {
      await safeUpsert('staff', payload);
    } catch (e) {
      return localApi.post('staff', s);
    }
  },

  async deleteStaff(id: string) {
    if (useLocalFallback) return localApi.delete('staff', id);
    const { error } = await supabase!.from('staff').delete().eq('id', id);
    if (error) return localApi.delete('staff', id);
  },

  async getGroups(): Promise<ParticipantGroup[]> {
    if (useLocalFallback) return localApi.get('groups');
    const { data, error } = await supabase!.from('participant_groups').select('*').order('name');
    if (error) return localApi.get('groups');
    return data || [];
  },

  async upsertGroup(g: ParticipantGroup) {
    if (useLocalFallback) return localApi.post('groups', g);
    const payload = { ...g, updated_at: new Date().toISOString() };
    try {
      await safeUpsert('participant_groups', payload);
    } catch (e) {
      return localApi.post('groups', g);
    }
  },

  async deleteGroup(id: string) {
    if (useLocalFallback) return localApi.delete('groups', id);
    const { error } = await supabase!.from('participant_groups').delete().eq('id', id);
    if (error) return localApi.delete('groups', id);
  },

  async getUsers(): Promise<User[]> {
    if (useLocalFallback) return localApi.get('users');
    const { data, error } = await supabase!.from('users').select('*').order('username');
    if (error) return localApi.get('users');
    return (data || []).map(mapUser);
  },

  async upsertUser(u: User) {
    if (useLocalFallback) return localApi.post('users', u);
    const payload = unmapUser(u);
    try {
      await safeUpsert('users', payload);
    } catch (e) {
      return localApi.post('users', u);
    }
  },

  async deleteUser(id: string) {
    if (useLocalFallback) return localApi.delete('users', id);
    const { error } = await supabase!.from('users').delete().eq('id', id);
    if (error) return localApi.delete('users', id);
  },

  async getSettings(): Promise<SystemSettings | null> {
    if (useLocalFallback) return localApi.getSettings();
    try {
      const { data, error } = await supabase!.from('system_settings').select('*').single();
      if (error) {
        console.warn("Supabase: Error fetching system_settings (might not exist yet):", error.message);
        return localApi.getSettings();
      }
      return mapSettings(data);
    } catch (err) {
      console.error("Supabase: Unexpected error in getSettings:", err);
      return localApi.getSettings();
    }
  },

  async updateSettings(s: SystemSettings) {
    if (useLocalFallback) return localApi.postSettings(s);
    const payload = unmapSettings(s);
    try {
      await safeUpsert('system_settings', payload);
    } catch (e) {
      return localApi.postSettings(s);
    }
  },

  subscribeTable(table: string, callback: (payload: any) => void) {
    if (useLocalFallback) {
      // Fallback to WebSocket for local backend
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}`);
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.table === table || (table === 'participant_groups' && message.table === 'groups')) {
            callback({
              eventType: message.type === 'UPDATE' ? 'UPDATE' : 'DELETE',
              new: message.data,
              old: { id: message.id },
              mappedData: message.data
            });
          }
        } catch (e) {}
      };
      ws.onerror = () => {
        console.warn(`WebSocket error for table ${table}, real-time updates may be disabled.`);
      };
      return { unsubscribe: () => ws.close() };
    }
    return supabase!
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

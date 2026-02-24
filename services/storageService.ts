
import { Meeting, Unit, Staff, ParticipantGroup, User, Endpoint, SavedReportConfig, SystemSettings } from '../types';
import { MOCK_MEETINGS, MOCK_UNITS, MOCK_STAFF, MOCK_PARTICIPANT_GROUPS, MOCK_USERS, MOCK_ENDPOINTS } from '../constants';

const DB_KEYS = {
  MEETINGS: 'cth_sla_meetings',
  UNITS: 'cth_sla_units',
  STAFF: 'cth_sla_staff',
  GROUPS: 'cth_sla_groups',
  USERS: 'cth_sla_users',
  ENDPOINTS: 'cth_sla_endpoints',
  SAVED_REPORTS: 'cth_sla_saved_reports',
  SYSTEM_SETTINGS: 'cth_sla_system_settings'
};

const DEFAULT_SETTINGS: SystemSettings = {
  systemName: 'ỦY BAN NHÂN DÂN TỈNH SƠN LA',
  shortName: 'HỘI NGHỊ TRỰC TUYẾN SƠN LA',
  primaryColor: '#3B82F6'
};

export const storageService = {
  init() {
    if (typeof window === 'undefined' || !window.localStorage) {
      console.warn("localStorage is not available in this environment.");
      return;
    }
    try {
      if (!localStorage.getItem(DB_KEYS.UNITS)) {
        localStorage.setItem(DB_KEYS.UNITS, JSON.stringify(MOCK_UNITS));
      }
      if (!localStorage.getItem(DB_KEYS.STAFF)) {
        localStorage.setItem(DB_KEYS.STAFF, JSON.stringify(MOCK_STAFF));
      }
      if (!localStorage.getItem(DB_KEYS.GROUPS)) {
        localStorage.setItem(DB_KEYS.GROUPS, JSON.stringify(MOCK_PARTICIPANT_GROUPS));
      }
      if (!localStorage.getItem(DB_KEYS.USERS)) {
        localStorage.setItem(DB_KEYS.USERS, JSON.stringify(MOCK_USERS));
      }
      if (!localStorage.getItem(DB_KEYS.MEETINGS)) {
        localStorage.setItem(DB_KEYS.MEETINGS, JSON.stringify(MOCK_MEETINGS));
      }
      if (!localStorage.getItem(DB_KEYS.ENDPOINTS)) {
        localStorage.setItem(DB_KEYS.ENDPOINTS, JSON.stringify(MOCK_ENDPOINTS));
      }
      if (!localStorage.getItem(DB_KEYS.SAVED_REPORTS)) {
        localStorage.setItem(DB_KEYS.SAVED_REPORTS, JSON.stringify([]));
      }
      if (!localStorage.getItem(DB_KEYS.SYSTEM_SETTINGS)) {
        localStorage.setItem(DB_KEYS.SYSTEM_SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
      }
    } catch (e) {
      console.warn("localStorage is not available or quota exceeded:", e);
    }
  },

  getData<T>(key: string, defaultValue: T): T {
    try {
      const data = localStorage.getItem(key);
      if (!data) return defaultValue;
      const parsed = JSON.parse(data);
      return parsed === null ? defaultValue : (parsed as T);
    } catch (e) {
      console.error(`Error reading ${key} from localStorage:`, e);
      return defaultValue;
    }
  },

  saveData<T>(key: string, data: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error(`Error saving ${key} to localStorage:`, e);
    }
  },

  getMeetings(): Meeting[] { 
    const data = this.getData(DB_KEYS.MEETINGS, MOCK_MEETINGS); 
    return Array.isArray(data) ? data : MOCK_MEETINGS;
  },
  saveMeetings(data: Meeting[]) { this.saveData(DB_KEYS.MEETINGS, data); },

  getUnits(): Unit[] { 
    const data = this.getData(DB_KEYS.UNITS, MOCK_UNITS); 
    return Array.isArray(data) ? data : MOCK_UNITS;
  },
  saveUnits(data: Unit[]) { this.saveData(DB_KEYS.UNITS, data); },

  getStaff(): Staff[] { 
    const data = this.getData(DB_KEYS.STAFF, MOCK_STAFF); 
    return Array.isArray(data) ? data : MOCK_STAFF;
  },
  saveStaff(data: Staff[]) { this.saveData(DB_KEYS.STAFF, data); },

  getGroups(): ParticipantGroup[] { 
    const data = this.getData(DB_KEYS.GROUPS, MOCK_PARTICIPANT_GROUPS); 
    return Array.isArray(data) ? data : MOCK_PARTICIPANT_GROUPS;
  },
  saveGroups(data: ParticipantGroup[]) { this.saveData(DB_KEYS.GROUPS, data); },

  getUsers(): User[] { 
    const data = this.getData(DB_KEYS.USERS, MOCK_USERS); 
    return Array.isArray(data) ? data : MOCK_USERS;
  },
  saveUsers(data: User[]) { this.saveData(DB_KEYS.USERS, data); },

  getEndpoints(): Endpoint[] { 
    const data = this.getData(DB_KEYS.ENDPOINTS, MOCK_ENDPOINTS); 
    return Array.isArray(data) ? data : MOCK_ENDPOINTS;
  },
  saveEndpoints(data: Endpoint[]) { this.saveData(DB_KEYS.ENDPOINTS, data); },

  getSavedReports(): SavedReportConfig[] { 
    const data = this.getData(DB_KEYS.SAVED_REPORTS, []); 
    return Array.isArray(data) ? data : [];
  },
  saveSavedReports(data: SavedReportConfig[]) { this.saveData(DB_KEYS.SAVED_REPORTS, data); },

  getSystemSettings(): SystemSettings { 
    const data = this.getData(DB_KEYS.SYSTEM_SETTINGS, DEFAULT_SETTINGS); 
    return (data && typeof data === 'object' && !Array.isArray(data)) ? data : DEFAULT_SETTINGS;
  },
  saveSystemSettings(data: SystemSettings) { this.saveData(DB_KEYS.SYSTEM_SETTINGS, data); }
};

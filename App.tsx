
import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area, Legend
} from 'recharts';
import { LayoutDashboard, CalendarDays, MonitorPlay, FileText, Settings, Users, Share2, LogOut, Menu, X, Activity, BarChart3, Building2, User as UserIcon, Clock, Zap, Target, ShieldEllipsis, Bell, Video } from 'lucide-react';
import { Meeting, Endpoint, EndpointStatus, Unit, Staff, ParticipantGroup, User, SystemSettings } from './types';
import StatCard from './components/StatCard';
import MeetingList from './components/MeetingList';
import MonitoringGrid from './components/MonitoringGrid';
import ManagementPage from './components/ManagementPage';
import UserManagement from './components/UserManagement';
import ReportsPage from './components/ReportsPage';
import LoginView from './components/LoginView';
import CreateMeetingModal from './components/CreateMeetingModal';
import MeetingDetailModal from './components/MeetingDetailModal';
import ChangePasswordModal from './components/ChangePasswordModal';
import UpcomingAlert from './components/UpcomingAlert';
import NotificationToast from './components/NotificationToast';
import ExportPage from './components/ExportPage';
import { storageService } from './services/storageService';
import { supabaseService } from './services/supabaseService';

const VIBRANT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

storageService.init();

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'meetings' | 'monitoring' | 'management' | 'accounts' | 'reports' | 'deployment'>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [meetings, setMeetings] = useState<Meeting[]>(() => storageService.getMeetings());
  const [endpoints, setEndpoints] = useState<Endpoint[]>(() => storageService.getEndpoints());
  const [units, setUnits] = useState<Unit[]>(() => storageService.getUnits());
  const [staff, setStaff] = useState<Staff[]>(() => storageService.getStaff());
  const [groups, setGroups] = useState<ParticipantGroup[]>(() => storageService.getGroups());
  const [users, setUsers] = useState<User[]>(() => storageService.getUsers());
  const [systemSettings, setSystemSettings] = useState<SystemSettings>(() => storageService.getSystemSettings());
  
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  
  // States cho nhắc nhở
  const [notifiedMeetingIds, setNotifiedMeetingIds] = useState<Set<string>>(new Set());
  const [currentAlertMeeting, setCurrentAlertMeeting] = useState<Meeting | null>(null);
  const [showToast, setShowToast] = useState(false);

  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasSyncedOnce, setHasSyncedOnce] = useState(false);

  const isAdmin = currentUser?.role === 'ADMIN';
  const isOperator = currentUser?.role === 'OPERATOR';
  const canManageMeetings = isAdmin || isOperator;

  // Yêu cầu quyền thông báo ngay khi tải trang (nếu browser hỗ trợ)
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Logic kiểm tra nhắc nhở định kỳ (mỗi 1 phút) - Chạy cả khi chưa login
  useEffect(() => {
    const checkMeetings = () => {
      const now = new Date();
      const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
      const fifteenMinsLater = new Date(now.getTime() + 15 * 60 * 1000);

      const upcoming = (meetings || []).filter(m => {
        if (!m || m.status === 'CANCELLED') return false;
        const start = new Date(m.startTime);
        return start > now && start <= oneHourLater;
      });

      // Lấy cuộc họp gần nhất để hiển thị Banner trên Dashboard
      const nextOne = upcoming.sort((a, b) => {
        const timeA = a && a.startTime ? new Date(a.startTime).getTime() : 0;
        const timeB = b && b.startTime ? new Date(b.startTime).getTime() : 0;
        return timeA - timeB;
      })[0];
      setCurrentAlertMeeting(nextOne || null);

      // Xử lý gửi thông báo đẩy và Toast cho cuộc họp trong vòng 15 phút
      const immediate = upcoming.find(m => new Date(m.startTime) <= fifteenMinsLater);
      if (immediate && !notifiedMeetingIds.has(immediate.id)) {
        // Gửi Browser Notification
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('🔔 Hội nghị sắp bắt đầu!', {
            body: `${immediate.title} sẽ diễn ra lúc ${new Date(immediate.startTime).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit', hour12: false})}`,
            icon: systemSettings?.logoBase64 || 'https://cdn-icons-png.flaticon.com/512/3661/3661331.png'
          });
        }
        
        // Show UI Toast
        setShowToast(true);
        setNotifiedMeetingIds(prev => new Set(prev).add(immediate.id));
      }
    };

    checkMeetings();
    const interval = setInterval(checkMeetings, 60000);
    return () => clearInterval(interval);
  }, [meetings, notifiedMeetingIds, systemSettings?.logoBase64]);

  const mergeData = <T extends { id: string, updatedAt?: string }>(cloudData: T[], localData: T[]): T[] => {
    const mergedMap = new Map<string, T>();
    if (Array.isArray(localData)) {
      localData.forEach(item => {
        if (item && item.id) mergedMap.set(item.id, item);
      });
    }
    if (Array.isArray(cloudData)) {
      cloudData.forEach(cloudItem => {
        if (!cloudItem || !cloudItem.id) return;
        const localItem = mergedMap.get(cloudItem.id);
        if (!localItem) {
          mergedMap.set(cloudItem.id, cloudItem);
        } else {
          const cloudDate = cloudItem.updatedAt ? new Date(cloudItem.updatedAt).getTime() : 0;
          const localDate = localItem.updatedAt ? new Date(localItem.updatedAt).getTime() : 0;
          if (cloudDate >= localDate) mergedMap.set(cloudItem.id, cloudItem);
        }
      });
    }
    return Array.from(mergedMap.values());
  };

  const syncData = async () => {
    console.log("Starting data sync...");
    if (!supabaseService.isConfigured()) {
      console.log("Supabase not configured, skipping sync.");
      setHasSyncedOnce(true);
      return;
    }
    setIsSyncing(true);
    try {
      // Test connection first
      const connTest = await supabaseService.testConnection();
      if (!connTest.success) {
        console.error("Supabase Connection Error:", connTest.message);
        throw new Error(connTest.message);
      }
      console.log("Supabase Connection Verified:", connTest.message);

      const [cloudMeetings, cloudEndpoints, cloudUnits, cloudStaff, cloudGroups, cloudUsers, cloudSettings] = await Promise.all([
        supabaseService.getMeetings(),
        supabaseService.getEndpoints(),
        supabaseService.getUnits(),
        supabaseService.getStaff(),
        supabaseService.getGroups(),
        supabaseService.getUsers(),
        supabaseService.getSettings()
      ]);

      console.log("Cloud data fetched:", {
        meetings: cloudMeetings?.length,
        endpoints: cloudEndpoints?.length,
        units: cloudUnits?.length,
        staff: cloudStaff?.length,
        groups: cloudGroups?.length,
        users: cloudUsers?.length,
        settings: !!cloudSettings
      });

      setMeetings(prev => {
        const merged = mergeData(cloudMeetings || [], prev).sort((a, b) => {
          const timeA = a && a.startTime ? new Date(a.startTime).getTime() : 0;
          const timeB = b && b.startTime ? new Date(b.startTime).getTime() : 0;
          return timeB - timeA;
        });
        storageService.saveMeetings(merged);
        return merged;
      });
      setEndpoints(prev => { const merged = mergeData(cloudEndpoints || [], prev); storageService.saveEndpoints(merged); return merged; });
      setUnits(prev => { const merged = mergeData(cloudUnits || [], prev); storageService.saveUnits(merged); return merged; });
      setStaff(prev => { const merged = mergeData(cloudStaff || [], prev); storageService.saveStaff(merged); return merged; });
      setGroups(prev => { const merged = mergeData(cloudGroups || [], prev); storageService.saveGroups(merged); return merged; });
      setUsers(prev => { const merged = mergeData(cloudUsers || [], prev); storageService.saveUsers(merged); return merged; });
      
      if (cloudSettings) {
        setSystemSettings(cloudSettings);
        storageService.saveSystemSettings(cloudSettings);
      }
      setLastRefreshed(new Date());
      setHasSyncedOnce(true);
      console.log("Data sync completed successfully.");
    } catch (err) {
      console.error("Đồng bộ thất bại:", err);
      // alert("Lỗi đồng bộ dữ liệu từ Cloud. Vui lòng kiểm tra kết nối API Supabase.");
    } finally {
      setIsSyncing(false);
      setHasSyncedOnce(true);
    }
  };

  useEffect(() => {
    syncData();

    const tables = ['meetings', 'endpoints', 'units', 'staff', 'participant_groups', 'users', 'system_settings'];
    const subscriptions = tables.map(table => {
      return supabaseService.subscribeTable(table, (payload) => {
        const { eventType, old, mappedData } = payload;
        
        const updateMap: Record<string, any> = {
          'meetings': { state: setMeetings, storage: (data: any) => storageService.saveMeetings(data) },
          'endpoints': { state: setEndpoints, storage: (data: any) => storageService.saveEndpoints(data) },
          'units': { state: setUnits, storage: (data: any) => storageService.saveUnits(data) },
          'staff': { state: setStaff, storage: (data: any) => storageService.saveStaff(data) },
          'participant_groups': { state: setGroups, storage: (data: any) => storageService.saveGroups(data) },
          'users': { state: setUsers, storage: (data: any) => storageService.saveUsers(data) }
        };

        if (table === 'system_settings' && mappedData) {
          setSystemSettings(mappedData);
          storageService.saveSystemSettings(mappedData);
          return;
        }

        const config = updateMap[table];
        if (config) {
          config.state((prev: any[]) => {
            let next = [...prev];
            if (eventType === 'INSERT') {
              if (!prev.some(item => item.id === mappedData.id)) next = [mappedData, ...prev];
            } else if (eventType === 'UPDATE') {
              next = prev.map(item => item.id === mappedData.id ? mappedData : item);
              if (table === 'meetings') {
                setSelectedMeeting(current => (current && current.id === mappedData.id) ? mappedData : current);
              }
              if (currentUser && table === 'users' && mappedData.id === currentUser.id) {
                setCurrentUser(mappedData);
              }
            } else if (eventType === 'DELETE') {
              next = prev.filter(item => item.id !== old.id);
              if (table === 'meetings' && selectedMeeting?.id === old.id) setSelectedMeeting(null);
            }
            
            config.storage(next);
            return next;
          });
        }
      });
    });

    return () => subscriptions.forEach(sub => sub?.unsubscribe());
  }, []); // Run only once on mount

  const dashboardStats = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const validMeetings = (meetings || []).filter(m => m && m.status !== 'CANCELLED');

    const weeklyMeetings = validMeetings.filter(m => m && m.startTime && new Date(m.startTime) >= startOfWeek);
    const monthlyMeetings = validMeetings.filter(m => m && m.startTime && new Date(m.startTime) >= startOfMonth);
    const yearlyMeetings = validMeetings.filter(m => m && m.startTime && new Date(m.startTime) >= startOfYear);

    const unitMap: Record<string, number> = {};
    validMeetings.forEach(m => {
      if (m && m.hostUnit) {
        unitMap[m.hostUnit] = (unitMap[m.hostUnit] || 0) + 1;
      }
    });

    const unitStats = Object.entries(unitMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const topUnit = unitStats[0]?.name || "Chưa xác định";
    const connected = (endpoints || []).filter(e => e && e.status === EndpointStatus.CONNECTED).length;
    const uptime = (endpoints || []).length > 0 ? ((connected / endpoints.length) * 100).toFixed(1) : "0";

    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const dateStr = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
      const count = validMeetings.filter(m => m && m.startTime && new Date(m.startTime).toDateString() === d.toDateString()).length;
      return { name: dateStr, count };
    });

    const totalDurationMs = validMeetings.reduce((acc, m) => {
      if (!m || !m.startTime || !m.endTime) return acc;
      const start = new Date(m.startTime).getTime();
      const end = new Date(m.endTime).getTime();
      return acc + (end - start);
    }, 0);
    
    const avgDurationHours = validMeetings.length > 0 
      ? (totalDurationMs / (1000 * 60 * 60 * validMeetings.length)).toFixed(1) 
      : "0";

    const onTimeRate = validMeetings.length > 0 
      ? (100 - (validMeetings.filter(m => m.status === 'POSTPONED').length / validMeetings.length * 100)).toFixed(1)
      : "100";

    const engagementScore = validMeetings.length > 0 
      ? Math.min(100, Math.floor(validMeetings.reduce((acc, m) => {
          const epCount = Array.isArray(m?.endpoints) ? m.endpoints.length : 0;
          const partCount = Array.isArray(m?.participants) ? m.participants.length : 0;
          return acc + (epCount * 2 + partCount);
        }, 0) / validMeetings.length * 1.5))
      : 0;

    return {
      weekly: weeklyMeetings.length,
      monthly: monthlyMeetings.length,
      yearly: yearlyMeetings.length,
      topUnit,
      unitStats,
      uptime,
      last7Days,
      avgDuration: avgDurationHours,
      onTimeRate: onTimeRate,
      engagementScore: engagementScore,
      recentMeetings: [...(meetings || [])]
        .filter(m => m && m.startTime)
        .sort((a, b) => {
          const timeA = a && a.startTime ? new Date(a.startTime).getTime() : 0;
          const timeB = b && b.startTime ? new Date(b.startTime).getTime() : 0;
          return timeB - timeA;
        })
        .slice(0, 5)
    };
  }, [meetings, endpoints]);

  const handleLogout = () => { setCurrentUser(null); setActiveTab('dashboard'); };
  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  
  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    setIsSidebarOpen(false);
  };

  if (!hasSyncedOnce && isSyncing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white font-sans">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-blue-500/20 rounded-full"></div>
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin absolute inset-0"></div>
          </div>
          <div className="text-center">
            <p className="text-sm font-black uppercase tracking-[0.3em] text-blue-400 mb-2">Hệ thống CTH Sơn La</p>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Đang đồng bộ dữ liệu...</p>
          </div>
        </div>
      </div>
    );
  }

  const handleUpdateMeeting = async (meeting: Meeting) => {
    const updatedMeeting = { ...meeting, updatedAt: new Date().toISOString() };
    
    // 1. Update local state and storage first for immediate feedback
    setMeetings(prev => {
      const updated = prev.map(m => m.id === updatedMeeting.id ? updatedMeeting : m);
      storageService.saveMeetings(updated);
      return updated;
    });

    if (selectedMeeting && selectedMeeting.id === updatedMeeting.id) {
        setSelectedMeeting(updatedMeeting);
    }
    
    // 2. Then sync to cloud
    if (supabaseService.isConfigured()) {
      try { 
        await supabaseService.upsertMeeting(updatedMeeting); 
        setLastRefreshed(new Date());
      } catch (err: any) { 
        console.error("Cập nhật Cloud thất bại:", err); 
        alert(`Cập nhật lên Cloud thất bại: ${err.message || 'Lỗi không xác định'}. Dữ liệu vẫn được lưu tạm thời trên trình duyệt này.`);
      }
    }
  };

  const handleDeleteMeeting = async (id: string) => {
    if (!window.confirm('Xóa cuộc họp này vĩnh viễn khỏi hệ thống?')) return;
    setMeetings(prev => {
      const updated = prev.filter(m => m.id !== id);
      storageService.saveMeetings(updated);
      return updated;
    });
    if (selectedMeeting?.id === id) setSelectedMeeting(null);
    if (supabaseService.isConfigured()) {
      try { await supabaseService.deleteMeeting(id); } catch (err) { console.error("Xóa thất bại:", err); }
    }
  };

  const handleSelfUpdatePassword = async (updatedUser: User) => {
    setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
    setCurrentUser(updatedUser);
    storageService.saveUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u));

    if (supabaseService.isConfigured()) {
      try {
        await supabaseService.upsertUser(updatedUser);
      } catch (err) {
        console.error("Lỗi cập nhật mật khẩu Cloud:", err);
        throw err;
      }
    }
  };

  if (!currentUser) return (
    <>
      <LoginView users={users} meetings={meetings} onLoginSuccess={setCurrentUser} systemSettings={systemSettings} />
      {showToast && currentAlertMeeting && (
        <NotificationToast 
          meeting={currentAlertMeeting} 
          onClose={() => setShowToast(false)} 
          onAction={() => {
            setShowToast(false);
          }}
        />
      )}
    </>
  );

  const primaryBgStyle = { backgroundColor: systemSettings?.primaryColor || '#3B82F6' };
  const primaryTextStyle = { color: systemSettings?.primaryColor || '#3B82F6' };

  return (
    <div className="min-h-screen flex bg-gray-50 overflow-hidden relative">
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 lg:hidden backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} />
      )}

      <aside className={`fixed lg:static inset-y-0 left-0 w-64 bg-slate-900 text-white flex flex-col shadow-2xl flex-shrink-0 z-30 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 flex justify-between items-center">
          <div className="flex items-center gap-3 min-w-0">
             <div className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-xl flex items-center justify-center overflow-hidden shrink-0">
                {systemSettings?.logoBase64 ? <img src={systemSettings.logoBase64} alt="Logo" className="max-w-full max-h-full" /> : <Video size={20} style={primaryTextStyle} />}
             </div>
             <div className="flex flex-col min-w-0">
                <span className="text-xs font-black uppercase tracking-tight truncate">{systemSettings?.shortName || 'HỘI NGHỊ'}</span>
                <span className="text-[9px] font-bold text-blue-400 uppercase mt-0.5 truncate tracking-tighter">Cán bộ: {currentUser?.fullName || 'User'}</span>
             </div>
          </div>
          <button onClick={toggleSidebar} className="lg:hidden text-slate-400 hover:text-white"><X size={20} /></button>
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-4 overflow-y-auto custom-scrollbar">
          <button onClick={() => handleTabChange('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-[var(--primary-color)] text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`} style={activeTab === 'dashboard' ? primaryBgStyle : {}}><LayoutDashboard size={20} /> <span className="font-bold text-sm">Tổng quan</span></button>
          <button onClick={() => handleTabChange('reports')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'reports' ? 'bg-[var(--primary-color)] text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`} style={activeTab === 'reports' ? primaryBgStyle : {}}><FileText size={20} /> <span className="font-bold text-sm">Báo cáo</span></button>
          <button onClick={() => handleTabChange('meetings')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'meetings' ? 'bg-[var(--primary-color)] text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`} style={activeTab === 'meetings' ? primaryBgStyle : {}}><CalendarDays size={20} /> <span className="font-bold text-sm">Lịch họp</span></button>
          {isAdmin && (
            <button onClick={() => handleTabChange('monitoring')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'monitoring' ? 'bg-[var(--primary-color)] text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`} style={activeTab === 'monitoring' ? primaryBgStyle : {}}><MonitorPlay size={20} /> <span className="font-bold text-sm">Giám sát</span></button>
          )}
          {isAdmin && (
            <div className="pt-4 border-t border-slate-800 space-y-1">
               <p className="px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Hệ thống</p>
               <button onClick={() => handleTabChange('management')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'management' ? 'bg-[var(--primary-color)] text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`} style={activeTab === 'management' ? primaryBgStyle : {}}><Settings size={20} /> <span className="font-bold text-sm">Danh mục</span></button>
               <button onClick={() => handleTabChange('accounts')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'accounts' ? 'bg-[var(--primary-color)] text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`} style={activeTab === 'accounts' ? primaryBgStyle : {}}><Users size={20} /> <span className="font-bold text-sm">Tài khoản</span></button>
               <button onClick={() => handleTabChange('deployment')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'deployment' ? 'bg-[var(--primary-color)] text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`} style={activeTab === 'deployment' ? primaryBgStyle : {}}><Share2 size={20} /> <span className="font-bold text-sm">Triển khai</span></button>
            </div>
          )}
        </nav>

        <div className="p-6 border-t border-slate-800">
           <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-all font-bold text-sm"><LogOut size={18} /> Đăng xuất</button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-4 md:px-8 justify-between shrink-0 shadow-sm">
          <button onClick={toggleSidebar} className="lg:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg"><Menu size={24} /></button>
          
          <div className="flex items-center gap-4">
             <div 
               className={`flex items-center gap-2 px-3 py-1 border rounded-full cursor-pointer hover:bg-gray-100 transition-colors ${supabaseService.isConfigured() ? 'bg-gray-50 border-gray-200' : 'bg-red-50 border-red-100'}`}
               onClick={() => syncData()}
               title="Nhấn để đồng bộ ngay"
             >
                <div className={`w-2 h-2 rounded-full ${
                  !supabaseService.isConfigured() ? 'bg-red-500' :
                  isSyncing ? 'bg-amber-500 animate-spin' : 'bg-emerald-500 animate-pulse'
                }`}></div>
                <span className={`text-[10px] font-black uppercase tracking-widest ${!supabaseService.isConfigured() ? 'text-red-600' : 'text-slate-500'}`}>
                  {!supabaseService.isConfigured() ? 'Local Only' : (isSyncing ? 'Đang đồng bộ...' : `Cloud Sync: ${lastRefreshed.toLocaleTimeString('vi-VN', { hour12: false })}`)}
                </span>
             </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <button 
              onClick={() => setIsChangePasswordOpen(true)}
              className="p-2.5 text-slate-500 hover:bg-slate-100 rounded-full transition-all border border-transparent hover:border-slate-200 group relative"
              title="Đổi mật khẩu"
            >
              <ShieldEllipsis size={20} className="group-hover:text-indigo-600 transition-colors" />
            </button>
            
            <div className="flex items-center gap-3 bg-blue-50/50 px-4 py-1.5 rounded-full border border-blue-100/50">
              <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-[10px] text-white font-black shadow-lg shadow-blue-200">
                {(currentUser?.fullName || 'U').trim().split(/\s+/).pop()?.charAt(0).toUpperCase() || 'U'}
              </div>
              <p className="text-xs font-black text-gray-700 hidden sm:block">
                Tài khoản: <span style={primaryTextStyle}>{currentUser?.fullName || 'N/A'}</span>
              </p>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8">
          {activeTab === 'dashboard' && (
            <div className="space-y-8 animate-in fade-in duration-500">
               {/* Upcoming Meeting Banner Alert */}
               {currentAlertMeeting && (
                 <UpcomingAlert 
                   meeting={currentAlertMeeting} 
                   onViewDetail={setSelectedMeeting} 
                 />
               )}

               {/* Primary Stats */}
               <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                  <StatCard title="Họp trong Tuần" value={dashboardStats.weekly} icon={<CalendarDays color={systemSettings.primaryColor} />} description="Tổng số cuộc họp diễn ra trong tuần này." />
                  <StatCard title="Họp trong Tháng" value={dashboardStats.monthly} icon={<FileText color={systemSettings.primaryColor} />} description="Tổng số cuộc họp diễn ra trong tháng này." />
                  <StatCard title="Họp trong Năm" value={dashboardStats.yearly} icon={<BarChart3 className="text-amber-500" />} description={`Tổng số cuộc họp trong năm ${new Date().getFullYear()}.`} />
                  <StatCard title="Uptime Hạ tầng" value={`${dashboardStats.uptime}%`} icon={<MonitorPlay color={systemSettings.primaryColor} />} description="Tỷ lệ điểm cầu đang trực tuyến." />
               </div>

               {/* Efficiency KPIs Section */}
               <div className="space-y-4">
                  <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-l-4 border-blue-600 pl-4 mb-4">Chỉ số Hiệu quả Vận hành (KPIs)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <StatCard 
                      title="Thời lượng TB (Giờ)" 
                      value={dashboardStats.avgDuration} 
                      icon={<Clock className="text-indigo-500" />} 
                      trend="Ổn định"
                      trendUp={true}
                      description="Thời gian trung bình của mỗi cuộc họp diễn ra trên hệ thống."
                      tooltipTitle="Hiệu suất thời gian"
                    />
                    <StatCard 
                      title="Tỷ lệ đúng giờ" 
                      value={`${dashboardStats.onTimeRate}%`} 
                      icon={<Zap className="text-yellow-500" />} 
                      trend="+2.1%"
                      trendUp={true}
                      description="Tỷ lệ các cuộc họp bắt đầu và kết nối điểm cầu đúng thời gian quy định."
                      tooltipTitle="Độ tin cậy hạ tầng"
                    />
                    <StatCard 
                      title="Điểm hiệu quả" 
                      value={dashboardStats.engagementScore} 
                      icon={<Target className="text-red-500" />} 
                      trend="+8"
                      trendUp={true}
                      description="Điểm số đánh giá mức độ tương tác và quy mô tổ chức các hội nghị."
                      tooltipTitle="Chỉ số tương tác"
                    />
                  </div>
               </div>

               <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                  <div className="xl:col-span-2 bg-white p-6 md:p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
                     <h3 className="text-xs font-black uppercase text-gray-400 tracking-widest mb-8">Tần suất họp (7 ngày qua)</h3>
                     <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                           <AreaChart data={dashboardStats.last7Days}>
                              <defs>
                                <linearGradient id="colorCount" x1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor={systemSettings.primaryColor} stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor={systemSettings.primaryColor} stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <Area type="monotone" dataKey="count" stroke={systemSettings.primaryColor} strokeWidth={4} fill="url(#colorCount)" />
                              <XAxis dataKey="name" fontSize={10} fontWeight="bold" tick={{fill: '#94a3b8'}} />
                              <YAxis fontSize={10} fontWeight="bold" tick={{fill: '#94a3b8'}} />
                              <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                           </AreaChart>
                        </ResponsiveContainer>
                     </div>
                  </div>
                  
                  <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col">
                     <h3 className="text-xs font-black uppercase text-gray-400 tracking-widest mb-8">Top Đơn vị chủ trì</h3>
                     <div className="flex-1">
                        <ResponsiveContainer width="100%" height="100%">
                           <BarChart layout="vertical" data={dashboardStats.unitStats} margin={{ left: 20 }}>
                              <XAxis type="number" hide />
                              <YAxis dataKey="name" type="category" fontSize={9} fontWeight="bold" width={80} tick={{fill: '#64748b'}} />
                              <Tooltip cursor={{fill: 'transparent'}} />
                              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                                 {dashboardStats.unitStats.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={VIBRANT_COLORS[index % VIBRANT_COLORS.length]} />
                                 ))}
                              </Bar>
                           </BarChart>
                        </ResponsiveContainer>
                     </div>
                     <div className="mt-4 pt-4 border-t border-gray-50">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Đơn vị tích cực nhất:</p>
                        <p className="text-sm font-black text-slate-900 mt-1 truncate flex items-center gap-2">
                           <Building2 size={14} className="text-blue-500" />
                           {dashboardStats.topUnit}
                        </p>
                     </div>
                  </div>
               </div>

               <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-6 md:p-8 border-b border-gray-50 flex justify-between items-center bg-gray-50/30">
                     <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Cuộc họp gần đây</h3>
                     <button onClick={() => setActiveTab('meetings')} style={primaryTextStyle} className="text-xs font-bold hover:underline">Xem tất cả</button>
                  </div>
                  <div className="overflow-x-auto">
                     <table className="w-full text-left text-sm min-w-[800px]">
                        <thead className="bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                           <tr>
                              <th className="px-8 py-4">Tên cuộc họp</th>
                              <th className="px-8 py-4">Đơn vị chủ trì</th>
                              <th className="px-8 py-4">Thời gian</th>
                              <th className="px-8 py-4 text-center">Trạng thái</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                           {dashboardStats.recentMeetings.map(m => (
                             <tr key={m.id} className="hover:bg-gray-50 transition-all cursor-pointer" onClick={() => setSelectedMeeting(m)}>
                                <td className="px-8 py-5">
                                   <div className={`font-bold text-sm line-clamp-1 ${m.status === 'CANCELLED' ? 'text-red-600 line-through' : m.status === 'POSTPONED' ? 'text-amber-600 italic' : 'text-gray-900'}`}>
                                     {m.title}
                                   </div>
                                   <div className="text-[10px] text-gray-400 mt-1 font-mono uppercase tracking-tighter">ID: {m.id}</div>
                                </td>
                                <td className="px-8 py-5">
                                   <div className="font-bold text-[11px] text-slate-700">{m.hostUnit}</div>
                                </td>
                                <td className="px-8 py-5">
                                   <div className="text-[11px] font-bold text-blue-600">{new Date(m.startTime).toLocaleTimeString('vi-VN', { hour12: false })}</div>
                                   <div className="text-gray-500 text-[10px] mt-0.5">{new Date(m.startTime).toLocaleDateString('vi-VN')}</div>
                                </td>
                                <td className="px-8 py-5 text-center">
                                   {m.status === 'CANCELLED' ? (
                                      <span className="px-2 py-0.5 bg-red-100 text-red-600 text-[9px] font-black uppercase rounded">Đã huỷ</span>
                                   ) : m.status === 'POSTPONED' ? (
                                      <span className="px-2 py-0.5 bg-amber-100 text-amber-600 text-[9px] font-black uppercase rounded">Tạm hoãn</span>
                                   ) : (
                                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-600 text-[9px] font-black uppercase rounded">Hợp lệ</span>
                                   )}
                                </td>
                             </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'reports' && <ReportsPage meetings={meetings} endpoints={endpoints} currentUser={currentUser} />}
          {activeTab === 'meetings' && (
            <MeetingList 
              meetings={meetings} 
              onSelect={setSelectedMeeting} 
              isAdmin={canManageMeetings} 
              onEdit={m => { setEditingMeeting(m); setIsCreateModalOpen(true); }} 
              onDelete={isAdmin ? handleDeleteMeeting : undefined} 
              onAdd={() => { setEditingMeeting(null); setIsCreateModalOpen(true); }} 
              onUpdate={handleUpdateMeeting} 
            />
          )}
          {activeTab === 'monitoring' && isAdmin && <MonitoringGrid endpoints={endpoints} onUpdateEndpoint={async (e) => {
              if (supabaseService.isConfigured()) await supabaseService.upsertEndpoint(e);
              setEndpoints(prev => prev.map(item => item.id === e.id ? e : item));
          }} />}
          {activeTab === 'management' && <ManagementPage 
              units={units} staff={staff} participantGroups={groups} endpoints={endpoints} systemSettings={systemSettings} 
              onAddUnit={async u => { 
                const newUnit = { ...u, id: `U${Date.now()}` };
                if (supabaseService.isConfigured()) await supabaseService.upsertUnit(newUnit);
                setUnits(prev => [...prev, newUnit]);
              }} 
              onUpdateUnit={async u => { 
                if (supabaseService.isConfigured()) await supabaseService.upsertUnit(u);
                setUnits(prev => prev.map(item => item.id === u.id ? u : item));
              }} 
              onDeleteUnit={async id => { 
                if (supabaseService.isConfigured()) await supabaseService.deleteUnit(id);
                setUnits(prev => prev.filter(u => u.id !== id));
              }}
              onAddStaff={async s => { 
                const newStaff = { ...s, id: `S${Date.now()}` };
                if (supabaseService.isConfigured()) await supabaseService.upsertStaff(newStaff);
                setStaff(prev => [...prev, newStaff]);
              }}
              onUpdateStaff={async s => { 
                if (supabaseService.isConfigured()) await supabaseService.upsertStaff(s);
                setStaff(prev => prev.map(item => item.id === s.id ? s : item));
              }}
              onDeleteStaff={async id => { 
                if (supabaseService.isConfigured()) await supabaseService.deleteStaff(id);
                setStaff(prev => prev.filter(s => s.id !== id));
              }}
              onAddGroup={async g => { 
                const newGroup = { ...g, id: `G${Date.now()}` };
                if (supabaseService.isConfigured()) await supabaseService.upsertGroup(newGroup);
                setGroups(prev => [newGroup, ...prev]);
              }}
              onUpdateGroup={async g => { 
                if (supabaseService.isConfigured()) await supabaseService.upsertGroup(g);
                setGroups(prev => prev.map(item => item.id === g.id ? g : item));
              }}
              onDeleteGroup={async id => { 
                if (supabaseService.isConfigured()) await supabaseService.deleteGroup(id);
                setGroups(prev => prev.filter(g => g.id !== id));
              }}
              onAddEndpoint={async e => { 
                const newEp = { ...e, id: `${Date.now()}`, status: EndpointStatus.DISCONNECTED, lastConnected: 'N/A' };
                if (supabaseService.isConfigured()) await supabaseService.upsertEndpoint(newEp);
                setEndpoints(prev => [...prev, newEp]);
              }}
              onUpdateEndpoint={async (e) => {
                if (supabaseService.isConfigured()) await supabaseService.upsertEndpoint(e);
                setEndpoints(prev => prev.map(item => item.id === e.id ? e : item));
              }}
              onDeleteEndpoint={async id => { 
                if (supabaseService.isConfigured()) await supabaseService.deleteEndpoint(id);
                setEndpoints(prev => prev.filter(e => e.id !== id));
              }}
              onUpdateSettings={async s => {
                if (supabaseService.isConfigured()) {
                  try {
                    await supabaseService.updateSettings(s);
                  } catch (err) {
                    console.error("Lỗi cập nhật cấu hình lên Cloud:", err);
                  }
                }
                setSystemSettings(s);
                storageService.saveSystemSettings(s);
              }} 
          />}
          {activeTab === 'accounts' && <UserManagement users={users} currentUser={currentUser!} onAddUser={async u => {
              const newUser = { ...u, id: `${Date.now()}` };
              if (supabaseService.isConfigured()) await supabaseService.upsertUser(newUser);
              setUsers(prev => [...prev, newUser]);
          }} onUpdateUser={async u => {
              if (supabaseService.isConfigured()) await supabaseService.upsertUser(u);
              setUsers(prev => prev.map(item => item.id === u.id ? u : item));
          }} onDeleteUser={async id => {
              if (supabaseService.isConfigured()) await supabaseService.deleteUser(id);
              setUsers(prev => prev.filter(u => u.id !== id));
          }} />}
          {activeTab === 'deployment' && <ExportPage />}
        </div>
      </main>

      {/* Global Notifications */}
      {showToast && currentAlertMeeting && (
        <NotificationToast 
          meeting={currentAlertMeeting} 
          onClose={() => setShowToast(false)} 
          onAction={() => {
            setSelectedMeeting(currentAlertMeeting);
            setShowToast(false);
          }}
        />
      )}

      {selectedMeeting && <MeetingDetailModal meeting={selectedMeeting} onClose={() => setSelectedMeeting(null)} onUpdate={handleUpdateMeeting} />}
      {isCreateModalOpen && <CreateMeetingModal isOpen={isCreateModalOpen} onClose={() => { setIsCreateModalOpen(false); setEditingMeeting(null); }} onCreate={async (m) => {
        const newMeeting: Meeting = { 
          ...m, 
          id: m.id || `MEET-${Date.now()}`, 
          status: 'SCHEDULED',
          updatedAt: new Date().toISOString()
        };
        
        // 1. Save locally first
        setMeetings(prev => {
          const updated = [newMeeting, ...prev];
          storageService.saveMeetings(updated);
          return updated;
        });
        
        // 2. Sync to cloud
        if (supabaseService.isConfigured()) {
          try {
            await supabaseService.upsertMeeting(newMeeting);
            setLastRefreshed(new Date());
          } catch (err: any) {
            console.error("Lưu Cloud thất bại:", err);
            alert(`Lưu lên Cloud thất bại: ${err.message || 'Lỗi không xác định'}. Dữ liệu vẫn được lưu tạm thời trên trình duyệt này.`);
          }
        }
        
        setIsCreateModalOpen(false);
      }} onUpdate={handleUpdateMeeting} units={units} staff={staff} availableEndpoints={endpoints} editingMeeting={editingMeeting} />}
      
      {isChangePasswordOpen && currentUser && (
        <ChangePasswordModal 
          isOpen={isChangePasswordOpen} 
          onClose={() => setIsChangePasswordOpen(false)} 
          currentUser={currentUser} 
          onUpdate={handleSelfUpdatePassword}
        />
      )}
    </div>
  );
};

export default App;

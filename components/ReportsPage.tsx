
import React, { useState, useRef, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area, Legend, LabelList, PieChart, Pie
} from 'recharts';
import { Meeting, Endpoint, User } from '../types';
// @ts-ignore
import html2pdf from 'html2pdf.js';
import { Calendar, Building2, CheckCircle, AlertTriangle, FileText, Download, TrendingUp, Users, Clock, Hash, Eye, Printer, X } from 'lucide-react';

interface ReportsPageProps {
  meetings: Meeting[];
  endpoints: Endpoint[];
  currentUser?: User | null;
}

type GroupByOption = 'day' | 'week' | 'month' | 'year' | 'unit';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

const ReportsPage: React.FC<ReportsPageProps> = ({ meetings, currentUser }) => {
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [groupBy, setGroupBy] = useState<GroupByOption>('month');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  
  const reportRef = useRef<HTMLDivElement>(null);

  const getWeekNumber = (d: Date) => {
    const date = new Date(d.getTime());
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const week1 = new Date(date.getFullYear(), 0, 4);
    return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  };

  const setQuickRange = (range: '7d' | '30d' | 'thisMonth' | 'thisYear' | 'all') => {
    const end = new Date();
    const start = new Date();
    if (range === '7d') start.setDate(end.getDate() - 7);
    else if (range === '30d') start.setDate(end.getDate() - 30);
    else if (range === 'thisMonth') start.setDate(1);
    else if (range === 'thisYear') { start.setMonth(0); start.setDate(1); }
    else if (range === 'all') start.setFullYear(2020);
    
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  const filteredMeetings = useMemo(() => {
    if (!Array.isArray(meetings)) return [];
    const startTs = new Date(startDate || 0).setHours(0,0,0,0);
    const endTs = new Date(endDate || Date.now()).setHours(23,59,59,999);
    return meetings.filter(m => {
      if (!m || !m.startTime) return false;
      const mTime = new Date(m.startTime).getTime();
      return mTime >= startTs && mTime <= endTs;
    }).sort((a, b) => {
      const timeA = a && a.startTime ? new Date(a.startTime).getTime() : 0;
      const timeB = b && b.startTime ? new Date(b.startTime).getTime() : 0;
      return timeA - timeB;
    });
  }, [meetings, startDate, endDate]);

  const reportStats = useMemo(() => {
    const total = filteredMeetings.length;
    const scheduled = filteredMeetings.filter(m => m && (m.status === 'SCHEDULED' || !m.status)).length;
    const cancelled = filteredMeetings.filter(m => m && m.status === 'CANCELLED').length;
    const postponed = filteredMeetings.filter(m => m && m.status === 'POSTPONED').length;
    
    const uniqueUnits = new Set(filteredMeetings.filter(m => m && m.hostUnit).map(m => m.hostUnit)).size;
    
    // Thống kê theo tuần, tháng, năm của thời điểm hiện tại
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
    startOfWeek.setHours(0,0,0,0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const currentWeekCount = (meetings || []).filter(m => m && m.status !== 'CANCELLED' && m.startTime && new Date(m.startTime) >= startOfWeek).length;
    const currentMonthCount = (meetings || []).filter(m => m && m.status !== 'CANCELLED' && m.startTime && new Date(m.startTime) >= startOfMonth).length;
    const currentYearCount = (meetings || []).filter(m => m && m.status !== 'CANCELLED' && m.startTime && new Date(m.startTime) >= startOfYear).length;
    
    return { total, scheduled, cancelled, postponed, uniqueUnits, currentWeekCount, currentMonthCount, currentYearCount };
  }, [filteredMeetings, meetings]);

  const statsData = useMemo(() => {
    const groupMap: Record<string, number> = {};
    
    filteredMeetings.forEach(m => {
      const d = new Date(m.startTime);
      let key = '';
      
      switch (groupBy) {
        case 'day': key = d.toLocaleDateString('vi-VN'); break;
        case 'week': key = `Tuần ${getWeekNumber(d)}/${d.getFullYear()}`; break;
        case 'month': key = `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`; break;
        case 'year': key = `Năm ${d.getFullYear()}`; break;
        case 'unit': key = m.hostUnit; break;
      }
      groupMap[key] = (groupMap[key] || 0) + 1;
    });

    return Object.keys(groupMap).map(key => ({
      name: key,
      value: groupMap[key]
    })).sort((a, b) => groupBy === 'unit' ? b.value - a.value : 0);
  }, [filteredMeetings, groupBy]);

  const downloadPDF = async () => {
    if (!reportRef.current || isGenerating) return;
    
    setIsGenerating(true);
    
    try {
      const element = reportRef.current;
      
      // Cấu hình html2pdf
      const opt = {
        margin: 10,
        filename: `Bao_cao_Lich_Hop_${new Date().toISOString().slice(0,10)}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { 
          scale: 2,
          useCORS: true, 
          logging: false,
          letterRendering: true,
          backgroundColor: '#ffffff',
          onclone: (clonedDoc: Document) => {
            // 1. Xử lý triệt để tất cả các thẻ style (Tailwind classes)
            const styleTags = clonedDoc.getElementsByTagName('style');
            for (let i = 0; i < styleTags.length; i++) {
              const tag = styleTags[i];
              if (tag.innerHTML.includes('oklch') || tag.innerHTML.includes('oklab')) {
                tag.innerHTML = tag.innerHTML
                  .replace(/oklch\s*\([^)]+\)/gi, '#1e293b')
                  .replace(/oklab\s*\([^)]+\)/gi, '#1e293b');
              }
            }

            // 2. Xử lý triệt để lỗi màu oklch/oklab trong inline styles và SVG
            const allElements = clonedDoc.querySelectorAll('*');
            allElements.forEach((el: any) => {
              // Xử lý style inline
              const inlineStyle = el.getAttribute('style');
              if (inlineStyle && (inlineStyle.includes('oklch') || inlineStyle.includes('oklab'))) {
                el.setAttribute('style', inlineStyle
                  .replace(/oklch\s*\([^)]+\)/gi, '#1e293b')
                  .replace(/oklab\s*\([^)]+\)/gi, '#1e293b')
                );
              }

              // Xử lý các thuộc tính fill/stroke của SVG
              if (el instanceof SVGElement) {
                ['fill', 'stroke'].forEach(attr => {
                  const val = el.getAttribute(attr);
                  if (val && (val.includes('oklch') || val.includes('oklab'))) {
                    el.setAttribute(attr, '#1e293b');
                  }
                });
                
                // Đảm bảo các biểu đồ Recharts hiển thị đúng font
                if (el.tagName.toLowerCase() === 'text') {
                  el.style.fontFamily = 'Arial, sans-serif';
                }
              }
            });

            // 3. Ép kiểu cho container chính
            const pdfElements = clonedDoc.getElementsByClassName('pdf-safe');
            if (pdfElements.length > 0) {
              const container = pdfElements[0] as HTMLElement;
              container.style.backgroundColor = '#ffffff';
              container.style.color = '#0f172a';
              container.style.width = '1050px'; // Ép chiều rộng cố định để khớp A4 Landscape
            }
          }
        },
        jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'landscape' as const }
      };

      // Sử dụng chuỗi lệnh chuẩn của html2pdf.js
      await html2pdf().from(element).set(opt).save();
    } catch (error: any) {
      console.error("PDF Generation Error:", error);
      alert("Có lỗi xảy ra khi xuất PDF. Vui lòng thử lại.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = () => {
    // Để in tốt nhất, chúng ta nên in phần tử reportRef
    // Tuy nhiên window.print() in toàn bộ trang. 
    // Chúng ta đã có CSS @media print để ẩn các phần không cần thiết.
    window.print();
  };

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-500">
      {/* Control Panel */}
      <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-gray-100 shadow-sm no-print space-y-6">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-4">
            <h2 className="text-xl font-black text-gray-900 uppercase flex items-center gap-3">
              <FileText className="text-blue-600" />
              Thiết lập Báo cáo
            </h2>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setQuickRange('7d')} className="px-4 py-2 bg-gray-100 hover:bg-blue-600 hover:text-white rounded-xl text-[10px] font-black transition-all">7 Ngày</button>
              <button onClick={() => setQuickRange('30d')} className="px-4 py-2 bg-gray-100 hover:bg-blue-600 hover:text-white rounded-xl text-[10px] font-black transition-all">30 Ngày</button>
              <button onClick={() => setQuickRange('thisMonth')} className="px-4 py-2 bg-gray-100 hover:bg-blue-600 hover:text-white rounded-xl text-[10px] font-black transition-all">Tháng này</button>
              <button onClick={() => setQuickRange('thisYear')} className="px-4 py-2 bg-gray-100 hover:bg-blue-600 hover:text-white rounded-xl text-[10px] font-black transition-all">Năm nay</button>
            </div>
          </div>
          
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Từ ngày</label>
              <input type="date" className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Đến ngày</label>
              <input type="date" className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Gom nhóm biểu đồ</label>
              <select className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold cursor-pointer" value={groupBy} onChange={e => setGroupBy(e.target.value as any)}>
                <option value="day">Theo Ngày</option>
                <option value="week">Theo Tuần</option>
                <option value="month">Theo Tháng</option>
                <option value="year">Theo Năm</option>
                <option value="unit">Đơn vị chủ trì</option>
              </select>
            </div>
            <button 
              onClick={() => setShowPreview(true)}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest shadow-xl hover:bg-blue-500 transition-all flex items-center gap-2"
            >
              <Eye size={16} />
              Xem trước
            </button>
            <button 
              onClick={downloadPDF} 
              disabled={isGenerating}
              className={`px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest shadow-xl transition-all flex items-center gap-2 ${
                isGenerating ? 'bg-slate-400 cursor-not-allowed' : 'bg-slate-900 hover:bg-slate-800 text-white'
              }`}
            >
              {isGenerating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  Đang xử lý...
                </>
              ) : (
                <>
                  <Download size={16} />
                  Tải PDF
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 md:p-10 no-print">
          <div className="bg-white w-full max-w-6xl h-full rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in duration-300">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
                  <Eye size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase tracking-tighter text-slate-900">Xem trước Báo cáo</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Kiểm tra định dạng trước khi xuất bản</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={handlePrint}
                  className="px-5 py-2.5 bg-white border border-gray-200 text-slate-700 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all flex items-center gap-2 shadow-sm"
                >
                  <Printer size={16} />
                  In báo cáo
                </button>
                <button 
                  onClick={downloadPDF}
                  disabled={isGenerating}
                  className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2 shadow-xl"
                >
                  {isGenerating ? (
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <Download size={16} />
                  )}
                  Tải PDF
                </button>
                <button 
                  onClick={() => setShowPreview(false)}
                  className="p-2.5 bg-gray-100 text-gray-500 rounded-xl hover:bg-red-50 hover:text-red-600 transition-all"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            
            {/* Modal Content - Scrollable Preview */}
            <div className="flex-1 overflow-y-auto p-8 bg-gray-200/50 custom-scrollbar">
              <div className="max-w-[1100px] mx-auto shadow-2xl origin-top scale-[0.85] lg:scale-100 transition-transform">
                {/* We render the same content as reportRef here, but without the ref to avoid conflicts if needed, 
                    or we can just let it be. Actually, we want the preview to look exactly like the PDF. */}
                <ReportContent 
                  reportStats={reportStats} 
                  startDate={startDate} 
                  endDate={endDate} 
                  groupBy={groupBy} 
                  statsData={statsData} 
                  filteredMeetings={filteredMeetings} 
                  currentUser={currentUser} 
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Page Report Content (Hidden from print if needed, but usually we want it visible) */}
      <div ref={reportRef} className="no-print">
        <ReportContent 
          reportStats={reportStats} 
          startDate={startDate} 
          endDate={endDate} 
          groupBy={groupBy} 
          statsData={statsData} 
          filteredMeetings={filteredMeetings} 
          currentUser={currentUser} 
        />
      </div>
    </div>
  );
};

// Sub-component for the actual report content to keep it DRY
const ReportContent: React.FC<{
  reportStats: any;
  startDate: string;
  endDate: string;
  groupBy: string;
  statsData: any[];
  filteredMeetings: Meeting[];
  currentUser?: User | null;
}> = ({ reportStats, startDate, endDate, groupBy, statsData, filteredMeetings, currentUser }) => {
  return (
    <div className="bg-white rounded-[2rem] shadow-sm p-10 space-y-10 border border-gray-50 min-h-[1000px] pdf-safe text-slate-900 pdf-report-content w-full max-w-[1100px] mx-auto">
      {/* Header */}
      <div className="text-center mb-8 border-b-2 border-slate-900 pb-8">
        <h1 className="text-3xl font-black uppercase tracking-tighter text-slate-900">Báo cáo Thống kê Hội nghị</h1>
        <p className="text-sm font-bold text-blue-600 uppercase tracking-[0.1em] mt-2">Hệ thống Quản lý & Giám sát Cầu truyền hình tỉnh Sơn La</p>
        <div className="flex justify-center gap-6 mt-4 text-[10px] font-bold text-slate-400 uppercase">
          <p>Thời gian: {new Date(startDate).toLocaleDateString('vi-VN')} - {new Date(endDate).toLocaleDateString('vi-VN')}</p>
          <p>Ngày trích xuất: {new Date().toLocaleString('vi-VN')}</p>
        </div>
      </div>

      {/* Quick Stats Summary Area */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-5 bg-blue-50 border border-blue-100 rounded-[1.5rem]">
          <div className="flex items-center gap-3 text-blue-600 mb-2">
            <Calendar size={18} />
            <span className="text-[10px] font-black uppercase tracking-widest">Tổng cuộc họp</span>
          </div>
          <p className="text-3xl font-black text-slate-900">{reportStats.total}</p>
        </div>
        <div className="p-5 bg-emerald-50 border border-emerald-100 rounded-[1.5rem]">
          <div className="flex items-center gap-3 text-emerald-600 mb-2">
            <CheckCircle size={18} />
            <span className="text-[10px] font-black uppercase tracking-widest">Đã thực hiện</span>
          </div>
          <p className="text-3xl font-black text-slate-900">{reportStats.scheduled}</p>
        </div>
        <div className="p-5 bg-amber-50 border border-amber-100 rounded-[1.5rem]">
          <div className="flex items-center gap-3 text-amber-600 mb-2">
            <AlertTriangle size={18} />
            <span className="text-[10px] font-black uppercase tracking-widest">Tạm hoãn</span>
          </div>
          <p className="text-3xl font-black text-slate-900">{reportStats.postponed}</p>
        </div>
        <div className="p-5 bg-red-50 border border-red-100 rounded-[1.5rem]">
          <div className="flex items-center gap-3 text-red-600 mb-2">
            <Building2 size={18} />
            <span className="text-[10px] font-black uppercase tracking-widest">Số đơn vị</span>
          </div>
          <p className="text-3xl font-black text-slate-900">{reportStats.uniqueUnits}</p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 gap-10">
        <div className="space-y-4">
           <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-3">
             <div className="w-1 h-4 bg-blue-600 rounded-full"></div>
             Biểu đồ phân bổ cuộc họp ({groupBy === 'unit' ? 'Theo đơn vị' : 'Theo thời gian'})
           </h3>
           <div className="h-[350px] w-full bg-slate-50/30 p-6 rounded-[2rem] border border-slate-100">
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={statsData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                 <XAxis 
                   dataKey="name" 
                   fontSize={9} 
                   fontWeight="bold" 
                   tick={{fill: '#64748B'}} 
                   interval={0}
                   angle={groupBy === 'unit' ? -15 : 0}
                   textAnchor={groupBy === 'unit' ? 'end' : 'middle'}
                 />
                 <YAxis fontSize={9} fontWeight="bold" tick={{fill: '#64748B'}} />
                 <Tooltip cursor={{fill: '#F1F5F9'}} />
                 <Bar dataKey="value" name="Số cuộc họp" fill="#3B82F6" radius={[6, 6, 0, 0]} barSize={groupBy === 'unit' ? 30 : 50}>
                   {statsData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                   <LabelList dataKey="value" position="top" style={{ fill: '#1E293B', fontSize: '11px', fontWeight: '900' }} />
                 </Bar>
               </BarChart>
             </ResponsiveContainer>
           </div>
        </div>
      </div>

      {/* Table Summary */}
      <div className="space-y-4">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-3">
          <div className="w-1 h-4 bg-amber-500 rounded-full"></div>
          Bảng tổng hợp dữ liệu (Theo {groupBy})
        </h3>
        <div className="border border-slate-100 rounded-2xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-white text-slate-900 border-b-2 border-slate-900 text-[10px] uppercase font-black tracking-widest">
              <tr>
                <th className="px-6 py-4">Tiêu chí phân nhóm</th>
                <th className="px-6 py-4 text-center">Số lượng hội nghị</th>
                <th className="px-6 py-4 text-right">Tỷ lệ đóng góp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {statsData.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-3.5 font-bold text-slate-700">{row.name}</td>
                  <td className="px-6 py-3.5 text-center font-black text-blue-600 text-base">{row.value}</td>
                  <td className="px-6 py-3.5 text-right font-bold text-slate-400">{((row.value / reportStats.total) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed List */}
      <div className="space-y-4">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-3">
          <div className="w-1 h-4 bg-emerald-500 rounded-full"></div>
          Thông tin chi tiết các cuộc họp
        </h3>
        <div className="border border-slate-100 rounded-2xl overflow-hidden">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-white text-slate-900 border-b border-slate-200 text-[9px] uppercase font-black tracking-widest">
              <tr>
                <th className="px-4 py-3"><div className="flex items-center gap-1"><FileText size={10} /> Tên hội nghị</div></th>
                <th className="px-4 py-3"><div className="flex items-center gap-1"><Building2 size={10} /> Đơn vị chủ trì</div></th>
                <th className="px-4 py-3"><div className="flex items-center gap-1"><Clock size={10} /> Thời gian</div></th>
                <th className="px-4 py-3 text-center"><div className="flex justify-center items-center gap-1"><Hash size={10} /> Điểm cầu</div></th>
                <th className="px-4 py-3 text-center"><div className="flex justify-center items-center gap-1"><Users size={10} /> Thành phần</div></th>
                <th className="px-4 py-3 text-right">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredMeetings.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-bold text-slate-900 max-w-[200px] leading-tight">
                    <div className={m.status === 'CANCELLED' ? 'line-through opacity-50' : ''}>{m.title}</div>
                    {m.cancelReason && <div className="text-[9px] font-medium text-red-500 mt-1 italic">Lý do: {m.cancelReason}</div>}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-600">{m.hostUnit}</td>
                  <td className="px-4 py-3 text-slate-500 font-bold whitespace-nowrap">
                    {new Date(m.startTime).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md font-black">{Array.isArray(m.endpoints) ? m.endpoints.length : 0}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-md font-black">{Array.isArray(m.participants) ? m.participants.length : 0}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {m.status === 'CANCELLED' ? (
                      <span className="px-2 py-0.5 bg-red-100 text-red-600 text-[8px] font-black uppercase rounded">Đã huỷ</span>
                    ) : m.status === 'POSTPONED' ? (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-600 text-[8px] font-black uppercase rounded">Hoãn</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-600 text-[8px] font-black uppercase rounded">Hợp lệ</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer Signature */}
      <div className="pt-20 flex justify-between border-t border-slate-100">
         <div className="max-w-xs space-y-2">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ghi chú hệ thống</p>
            <p className="text-[9px] italic text-slate-400 leading-relaxed font-medium">Báo cáo được khởi tạo tự động. Các dữ liệu về thời gian và đơn vị được ghi nhận tại thời điểm kết thúc hội nghị.</p>
         </div>
         <div className="text-center w-60 space-y-20">
            <div className="space-y-1">
               <p className="font-black text-[10px] uppercase tracking-widest text-slate-900">Người lập báo cáo</p>
               <p className="text-[9px] text-slate-400 font-bold">(Ký và ghi rõ họ tên)</p>
            </div>
            <p className="font-black text-xs uppercase text-slate-900 italic">
               {currentUser?.fullName || 'Quản trị viên hệ thống'}
            </p>
         </div>
      </div>
    </div>
  );
};

export default ReportsPage;

'use client';
import { useState, useEffect, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  AreaChart,
  Area,
  Legend,
} from 'recharts';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function AnalyticsDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);

  // Global Units & Shared Period Filter States
  const [stayDurationUnit, setStayDurationUnit] = useState('hours');
  const [filterType, setFilterType] = useState('overall'); // 'overall' | 'year' | 'month'
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

  useEffect(() => {
    setIsMounted(true);
    fetch('/api/analytics')
      .then((res) => res.json())
      .then((d) => {
        setData(d);
        if (d.availableYears && d.availableYears.length > 0) {
          setSelectedYear(d.availableYears[0]);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Analytics fetch error:', err);
        setLoading(false);
      });
  }, []);

  // Filter raw records dynamically for ALL 4 CHARTS based on the period filter
  const filteredRecords = useMemo(() => {
    if (!data?.rawAssignments) return [];

    return data.rawAssignments.filter((a) => {
      if (filterType === 'overall') return true;
      if (filterType === 'year') return a.year === Number(selectedYear);
      if (filterType === 'month') return a.year === Number(selectedYear) && a.month === Number(selectedMonth);
      return true;
    });
  }, [data, filterType, selectedYear, selectedMonth]);

  // 1. DYNAMIC AVERAGE STAY DURATION PER ROOM
  const avgStayPerRoom = useMemo(() => {
    if (!data?.rooms) return [];

    const roomStayTotals = {};
    const roomStayCounts = {};

    filteredRecords.forEach((a) => {
      const checkInTime = a.check_in || a.checked_in_at || a.created_at;
      const checkOutTime = a.check_out;

      if (checkInTime && checkOutTime) {
        const roomNum = a.room_number;
        const durationHours = (new Date(checkOutTime) - new Date(checkInTime)) / (1000 * 60 * 60);

        if (durationHours > 0) {
          roomStayTotals[roomNum] = (roomStayTotals[roomNum] || 0) + durationHours;
          roomStayCounts[roomNum] = (roomStayCounts[roomNum] || 0) + 1;
        }
      }
    });

    return data.rooms.map((r) => {
      const roomNum = r.room_number;
      const totalHrs = roomStayTotals[roomNum] || 0;
      const count = roomStayCounts[roomNum] || 0;
      const avgHours = count > 0 ? parseFloat((totalHrs / count).toFixed(1)) : 0;
      const avgDays = count > 0 ? parseFloat((totalHrs / (count * 24)).toFixed(1)) : 0;

      return {
        room: `R-${roomNum}`,
        avgHours,
        avgDays,
      };
    });
  }, [data, filteredRecords]);

  // 2. DYNAMIC TOP FREQUENT GUESTS
  const topOccupantsData = useMemo(() => {
    const counts = {};
    filteredRecords.forEach((a) => {
      counts[a.name] = (counts[a.name] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([name, checkIns]) => ({ name, checkIns }))
      .sort((a, b) => b.checkIns - a.checkIns)
      .slice(0, 5);
  }, [filteredRecords]);

  // 3. DYNAMIC PEAK CHECK-IN & CHECK-OUT HOURS
  const peakHours = useMemo(() => {
    const checkInHourCounts = Array(24).fill(0);
    const checkOutHourCounts = Array(24).fill(0);

    filteredRecords.forEach((a) => {
      const checkInTime = a.check_in || a.checked_in_at || a.created_at;
      if (checkInTime) {
        const dIn = new Date(checkInTime);
        if (!isNaN(dIn.getTime())) {
          checkInHourCounts[dIn.getHours()] += 1;
        }
      }

      if (a.check_out) {
        const dOut = new Date(a.check_out);
        if (!isNaN(dOut.getTime())) {
          checkOutHourCounts[dOut.getHours()] += 1;
        }
      }
    });

    return checkInHourCounts.map((inCount, hr) => ({
      hour: `${String(hr).padStart(2, '0')}:00`,
      checkIns: inCount,
      checkOuts: checkOutHourCounts[hr],
    }));
  }, [filteredRecords]);

  // 4. DYNAMIC ROOM TURNOVER & OVERBOOKING FREQUENCY
  const roomTurnoverAndOverbook = useMemo(() => {
    if (!data?.rooms) return [];

    const roomTurnover = {};
    filteredRecords.forEach((a) => {
      const roomNum = a.room_number;
      if (roomNum) {
        roomTurnover[roomNum] = (roomTurnover[roomNum] || 0) + 1;
      }
    });

    return data.rooms.map((r) => {
      const roomNum = r.room_number;
      const maxCap = Number(r.max_capacity) || 2;

      const roomAssignments = filteredRecords.filter(
        (a) => String(a.room_id) === String(r.id) || String(a.room_number) === String(r.room_number)
      );

      const currentActiveCount = roomAssignments.filter((a) => {
        const isCompleted = a.status && String(a.status).toUpperCase() === 'COMPLETED';
        return !isCompleted && !a.check_out;
      }).length;

      const currentActiveOverbook = Math.max(0, currentActiveCount - maxCap);

      let peakOverbookCount = 0;
      roomAssignments.forEach((a) => {
        const checkInTime = a.check_in || a.checked_in_at || a.created_at;
        if (checkInTime) {
          const tIn = new Date(checkInTime).getTime();

          const activeAtTime = roomAssignments.filter((other) => {
            const otInStr = other.check_in || other.checked_in_at || other.created_at;
            if (!otInStr) return false;
            const otIn = new Date(otInStr).getTime();
            const otOut = other.check_out ? new Date(other.check_out).getTime() : Infinity;

            return otIn <= tIn && otOut > tIn;
          }).length;

          if (activeAtTime > maxCap) {
            const excess = activeAtTime - maxCap;
            if (excess > peakOverbookCount) {
              peakOverbookCount = excess;
            }
          }
        }
      });

      const finalOverbooked = Math.max(currentActiveOverbook, peakOverbookCount);

      return {
        room: `R-${roomNum}`,
        turnover: Number(roomTurnover[roomNum] || 0),
        overbooked: Number(finalOverbooked),
      };
    });
  }, [data, filteredRecords]);

  // Export CSV for currently filtered records
  const downloadOverbookCSV = () => {
    if (filteredRecords.length === 0) {
      alert('No logs available for the selected filter.');
      return;
    }

    const headers = ['Room Number', 'Occupant Name', 'Check-In Timestamp', 'Check-Out Timestamp', 'Status'];
    const rows = filteredRecords.map((log) => [
      `"R-${log.room_number}"`,
      `"${log.name}"`,
      `"${log.check_in || log.created_at}"`,
      `"${log.check_out || 'Active'}"`,
      `"${log.status || 'ACTIVE'}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `DPCC_Analytics_Report_${filterType}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading || !isMounted) {
    return (
      <div className="h-screen w-screen bg-slate-950 text-slate-100 flex items-center justify-center font-mono">
        Loading Occupant Analytics...
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 p-3 sm:p-4 font-sans max-w-7xl mx-auto flex flex-col justify-between">
      
      {/* HEADER */}
      <div className="border-b border-white/10 pb-2 flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-base sm:text-lg md:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300 uppercase tracking-wider">
            DPCC OCCUPANT ANALYTICS
          </h1>
          <p className="text-[10px] sm:text-xs text-slate-400">Occupant stay patterns, peak times, and room turnover statistics.</p>
        </div>
        <a
          href="/kiosk"
          className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-semibold transition text-slate-200 hover:text-white"
        >
          ← Back to Kiosk
        </a>
      </div>

      {/* 2x2 FLEX GRID */}
      <div className="flex-1 min-h-0 my-2 grid grid-cols-1 lg:grid-cols-2 gap-3">

        {/* 1. AVERAGE STAY DURATION PER ROOM */}
        <div className="bg-slate-900/80 border border-white/10 p-3 rounded-2xl backdrop-blur-xl flex flex-col min-h-0">
          <div className="flex justify-between items-center mb-2 shrink-0">
            <h2 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
              ⏱️ Average Stay Duration per Room
            </h2>
            <div className="flex bg-black/40 p-0.5 rounded-lg border border-white/10">
              <button
                onClick={() => setStayDurationUnit('hours')}
                className={`px-2 py-0.5 text-[9px] font-semibold rounded-md transition ${
                  stayDurationUnit === 'hours' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Hours
              </button>
              <button
                onClick={() => setStayDurationUnit('days')}
                className={`px-2 py-0.5 text-[9px] font-semibold rounded-md transition ${
                  stayDurationUnit === 'days' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Days
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 w-full relative">
            {avgStayPerRoom.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={avgStayPerRoom} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="room" stroke="#94a3b8" fontSize={10} />
                  <YAxis stroke="#94a3b8" fontSize={10} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#ffffff20', borderRadius: '8px', fontSize: '11px' }} />
                  <Bar
                    dataKey={stayDurationUnit === 'hours' ? 'avgHours' : 'avgDays'}
                    fill="#38bdf8"
                    radius={[4, 4, 0, 0]}
                    name={stayDurationUnit === 'hours' ? 'Avg Stay (hrs)' : 'Avg Stay (days)'}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-[10px] text-slate-500 font-mono">No completed stay data</div>
            )}
          </div>
        </div>

        {/* 2. TOP FREQUENT GUESTS WITH SHARED PERIOD FILTER */}
        <div className="bg-slate-900/80 border border-white/10 p-3 rounded-2xl backdrop-blur-xl flex flex-col min-h-0">
          <div className="flex justify-between items-center mb-2 shrink-0 gap-1 flex-wrap">
            <h2 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
              👤 Top Frequent Guests / Staff
            </h2>
            
            <div className="flex items-center gap-1.5">
              {/* Scope Selector (Controls ALL 4 Visualizations) */}
              <div className="flex bg-black/40 p-0.5 rounded-lg border border-white/10">
                {['overall', 'year', 'month'].map((type) => (
                  <button
                    key={type}
                    onClick={() => setFilterType(type)}
                    className={`px-2 py-0.5 text-[9px] font-semibold rounded-md transition capitalize ${
                      filterType === type ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>

              {/* Specific Year Selector */}
              {filterType !== 'overall' && (
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="bg-slate-950 border border-white/10 text-slate-200 text-[9px] rounded-lg px-1.5 py-0.5 focus:outline-none font-semibold"
                >
                  {(data?.availableYears || [new Date().getFullYear()]).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              )}

              {/* Specific Month Selector */}
              {filterType === 'month' && (
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="bg-slate-950 border border-white/10 text-slate-200 text-[9px] rounded-lg px-1.5 py-0.5 focus:outline-none font-semibold"
                >
                  {MONTH_NAMES.map((m, idx) => (
                    <option key={idx + 1} value={idx + 1}>{m.slice(0, 3)}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 w-full relative">
            {topOccupantsData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topOccupantsData} layout="vertical" margin={{ top: 5, right: 5, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis type="number" stroke="#94a3b8" fontSize={10} />
                  <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={10} width={100} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#ffffff20', borderRadius: '8px', fontSize: '11px' }} />
                  <Bar dataKey="checkIns" fill="#818cf8" radius={[0, 4, 4, 0]} name="Check-Ins" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-[10px] text-slate-500 font-mono">No occupant records for this period</div>
            )}
          </div>
        </div>

        {/* 3. PEAK HOURS */}
        <div className="bg-slate-900/80 border border-white/10 p-3 rounded-2xl backdrop-blur-xl flex flex-col min-h-0">
          <h2 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2 shrink-0">
            📈 Peak Check-In & Check-Out Hours
          </h2>
          <div className="flex-1 min-h-0 w-full relative">
            {peakHours.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={peakHours} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="hour" stroke="#94a3b8" fontSize={9} />
                  <YAxis stroke="#94a3b8" fontSize={10} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#ffffff20', borderRadius: '8px', fontSize: '11px' }} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Area type="monotone" dataKey="checkIns" stroke="#34d399" fill="#34d39920" name="Check-Ins" />
                  <Area type="monotone" dataKey="checkOuts" stroke="#f59e0b" fill="#f59e0b20" name="Check-Outs" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-[10px] text-slate-500 font-mono">No hourly records</div>
            )}
          </div>
        </div>

        {/* 4. OVERBOOKING & TURNOVER */}
        <div className="bg-slate-900/80 border border-white/10 p-3 rounded-2xl backdrop-blur-xl flex flex-col min-h-0">
          <div className="flex justify-between items-center mb-2 shrink-0">
            <h2 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
              🚨 Room Turnover & Overbooking Frequency
            </h2>
            <button
              onClick={downloadOverbookCSV}
              className="px-2 py-0.5 bg-rose-500/20 hover:bg-rose-500/40 border border-rose-500/40 text-rose-300 rounded-md text-[9px] font-semibold transition flex items-center gap-1 active:scale-95"
            >
              📥 Export CSV
            </button>
          </div>

          <div className="flex-1 min-h-0 w-full relative">
            {roomTurnoverAndOverbook.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={roomTurnoverAndOverbook} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="room" stroke="#94a3b8" fontSize={10} />
                  <YAxis stroke="#94a3b8" fontSize={10} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#ffffff20', borderRadius: '8px', fontSize: '11px' }} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Bar dataKey="turnover" fill="#60a5fa" radius={[3, 3, 0, 0]} name="Total Turnover" />
                  <Bar dataKey="overbooked" fill="#f87171" radius={[3, 3, 0, 0]} name="Overbook Events" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-[10px] text-slate-500 font-mono">No turnover records</div>
            )}
          </div>
        </div>

      </div>

      {/* FOOTER */}
      <div className="w-full border-t border-white/10 pt-2.5 pb-1 flex items-center justify-between text-[10px] md:text-xs text-slate-500 shrink-0">
        <span className="font-medium tracking-wide">Analytics Engine Active</span>
        <span className="font-medium tracking-wide">
          Developed by: rvo_045119
        </span>
      </div>
    </div>
  );
}
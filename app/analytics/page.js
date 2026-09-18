'use client';
import { useState, useEffect } from 'react';
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

export default function AnalyticsDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    fetch('/api/analytics')
      .then((res) => res.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Analytics fetch error:', err);
        setLoading(false);
      });
  }, []);

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

      {/* 2x2 FLEX GRID FILLING REMAINING SCREEN HEIGHT */}
      <div className="flex-1 min-h-0 my-2 grid grid-cols-1 lg:grid-cols-2 gap-3">

        {/* 1. AVERAGE STAY DURATION PER ROOM */}
        <div className="bg-slate-900/80 border border-white/10 p-3 rounded-2xl backdrop-blur-xl flex flex-col min-h-0">
          <h2 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2 shrink-0">
            ⏱️ Average Stay Duration per Room (Hours)
          </h2>
          <div className="flex-1 min-h-0 w-full relative">
            {data?.avgStayPerRoom?.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.avgStayPerRoom} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="room" stroke="#94a3b8" fontSize={10} />
                  <YAxis stroke="#94a3b8" fontSize={10} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#ffffff20', borderRadius: '8px', fontSize: '11px' }}
                  />
                  <Bar dataKey="avgHours" fill="#38bdf8" radius={[4, 4, 0, 0]} name="Avg Stay (hrs)" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-[10px] text-slate-500 font-mono">No completed stay data</div>
            )}
          </div>
        </div>

        {/* 2. TOP OCCUPANTS / FREQUENT GUESTS */}
        <div className="bg-slate-900/80 border border-white/10 p-3 rounded-2xl backdrop-blur-xl flex flex-col min-h-0">
          <h2 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2 shrink-0">
            👤 Top Frequent Guests / Staff
          </h2>
          <div className="flex-1 min-h-0 w-full relative">
            {data?.topOccupants?.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.topOccupants} layout="vertical" margin={{ top: 5, right: 5, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis type="number" stroke="#94a3b8" fontSize={10} />
                  <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={10} width={100} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#ffffff20', borderRadius: '8px', fontSize: '11px' }}
                  />
                  <Bar dataKey="checkIns" fill="#818cf8" radius={[0, 4, 4, 0]} name="Check-Ins" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-[10px] text-slate-500 font-mono">No occupant history</div>
            )}
          </div>
        </div>

        {/* 3. PEAK CHECK-IN & CHECK-OUT HOURS OF THE DAY */}
        <div className="bg-slate-900/80 border border-white/10 p-3 rounded-2xl backdrop-blur-xl flex flex-col min-h-0">
          <h2 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2 shrink-0">
            📈 Peak Check-In & Check-Out Hours
          </h2>
          <div className="flex-1 min-h-0 w-full relative">
            {data?.peakHours?.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.peakHours} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="hour" stroke="#94a3b8" fontSize={9} />
                  <YAxis stroke="#94a3b8" fontSize={10} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#ffffff20', borderRadius: '8px', fontSize: '11px' }}
                  />
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

        {/* 4. OVERBOOKING & TURNOVER FREQUENCY */}
        <div className="bg-slate-900/80 border border-white/10 p-3 rounded-2xl backdrop-blur-xl flex flex-col min-h-0">
          <h2 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2 shrink-0">
            🚨 Room Turnover & Overbooking Frequency
          </h2>
          <div className="flex-1 min-h-0 w-full relative">
            {data?.roomTurnoverAndOverbook?.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.roomTurnoverAndOverbook} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="room" stroke="#94a3b8" fontSize={10} />
                  <YAxis stroke="#94a3b8" fontSize={10} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#ffffff20', borderRadius: '8px', fontSize: '11px' }}
                  />
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
      <div className="text-center text-[10px] text-slate-500 border-t border-white/10 pt-1.5 flex items-center justify-between shrink-0">
        <span>Analytics Engine Active</span>
        <span className="font-mono text-slate-400 font-semibold">
          Developed by: RVO
        </span>
      </div>
    </div>
  );
}
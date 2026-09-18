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

  useEffect(() => {
    fetch('/api/analytics')
      .then((res) => res.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center font-mono">
        Loading Occupant Analytics...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans max-w-7xl mx-auto space-y-6">
      
      {/* HEADER */}
      <div className="border-b border-white/10 pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300 uppercase tracking-wider">
            DPCC OCCUPANT ANALYTICS
          </h1>
          <p className="text-xs text-slate-400 mt-1">Occupant stay patterns, peak times, and room turnover statistics.</p>
        </div>
        <a
          href="/kiosk"
          className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-semibold transition"
        >
          ← Back to Kiosk
        </a>
      </div>

      {/* CHARTS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* 1. AVERAGE STAY DURATION PER ROOM */}
        <div className="bg-slate-900/80 border border-white/10 p-5 rounded-2xl backdrop-blur-xl">
          <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4">
            ⏱️ Average Stay Duration per Room (Hours)
          </h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.avgStayPerRoom}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis dataKey="room" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#ffffff20', borderRadius: '12px' }}
                />
                <Bar dataKey="avgHours" fill="#38bdf8" radius={[6, 6, 0, 0]} name="Avg Stay (hrs)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2. TOP OCCUPANTS / FREQUENT GUESTS */}
        <div className="bg-slate-900/80 border border-white/10 p-5 rounded-2xl backdrop-blur-xl">
          <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4">
            👤 Top Frequent Guests / Staff
          </h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.topOccupants} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis type="number" stroke="#94a3b8" fontSize={12} />
                <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={11} width={100} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#ffffff20', borderRadius: '12px' }}
                />
                <Bar dataKey="checkIns" fill="#818cf8" radius={[0, 6, 6, 0]} name="Check-Ins" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 3. PEAK USAGE HOURS & DAYS */}
        <div className="bg-slate-900/80 border border-white/10 p-5 rounded-2xl backdrop-blur-xl">
          <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4">
            📈 Peak Check-in Hours of the Day
          </h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.peakHours}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis dataKey="hour" stroke="#94a3b8" fontSize={10} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#ffffff20', borderRadius: '12px' }}
                />
                <Area type="monotone" dataKey="checkIns" stroke="#34d399" fill="#34d39920" name="Check-Ins" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 4. OVERBOOKING & TURNOVER FREQUENCY PER ROOM */}
        <div className="bg-slate-900/80 border border-white/10 p-5 rounded-2xl backdrop-blur-xl">
          <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4">
            🚨 Room Turnover & Overbooking Frequency
          </h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.roomTurnoverAndOverbook}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis dataKey="room" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#ffffff20', borderRadius: '12px' }}
                />
                <Legend />
                <Bar dataKey="turnover" fill="#60a5fa" radius={[4, 4, 0, 0]} name="Total Turnover" />
                <Bar dataKey="overbooked" fill="#f87171" radius={[4, 4, 0, 0]} name="Overbook Events" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}
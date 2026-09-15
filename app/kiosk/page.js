'use client';
import { useState, useEffect, useRef } from 'react';

const parseLocalDate = (dateString) => {
  if (!dateString) return new Date();
  const safeIsoString = (dateString.endsWith('Z') || dateString.includes('+')) 
    ? dateString 
    : `${dateString}Z`;
  return new Date(safeIsoString);
};

const calculateDuration = (checkedInAt) => {
  if (!checkedInAt) return '';
  const now = new Date();
  const checkInDate = parseLocalDate(checkedInAt);
  const diffInMs = Math.max(0, now - checkInDate);
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = (diffInMs / (1000 * 60 * 60 * 24)).toFixed(1);

  if (diffInHours < 24) return `${diffInHours}h (${diffInDays}d)`;
  return `${Math.floor(diffInMs / (1000 * 60 * 60 * 24))} day(s)`;
};

const formatCheckInTime = (checkedInAt) => {
  if (!checkedInAt) return '';
  const date = parseLocalDate(checkedInAt);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export default function PhoneKiosk() {
  const [step, setStep] = useState('SELECT_STAFF');
  const [staffList, setStaffList] = useState([]);
  const [allRooms, setAllRooms] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const bufferRef = useRef('');

  useEffect(() => {
    fetchInitialData();
  }, [step]);

  const fetchInitialData = async () => {
    try {
      const sRes = await fetch('/api/staff');
      const sData = await sRes.json();
      const sortedStaff = (Array.isArray(sData) ? sData : []).sort((a, b) =>
        (a.full_name || '').localeCompare(b.full_name || '')
      );
      setStaffList(sortedStaff);

      const rRes = await fetch('/api/rooms');
      const rData = await rRes.json();
      setAllRooms(Array.isArray(rData) ? rData : []);
    } catch (err) {
      setErrorMsg('Failed to load initial data from server.');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (document.activeElement.tagName === 'INPUT') return;
      if (e.key === 'Enter') {
        const scannedCode = bufferRef.current.trim();
        if (scannedCode) handleFobScan(scannedCode);
        bufferRef.current = '';
      } else if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedStaff, selectedRoom]);

  const handleFobScan = async (fobUid) => {
    setErrorMsg('');
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key_fob_uid: fobUid,
          staff_id: selectedStaff?.id,
          room_id: selectedRoom?.id,
        }),
      });

      const text = await res.text();
      const data = text ? JSON.parse(text) : {};

      if (!res.ok) {
        setErrorMsg(data.error || 'Scan failed.');
        return;
      }

      setStatusMsg(
        data.action === 'CHECK_OUT'
          ? data.message || '✅ Room Checked Out!'
          : data.message || `✅ Room assigned to ${selectedStaff?.full_name}!`
      );
      
      setStep('SUCCESS');
      resetKiosk(3000);
    } catch (err) {
      setErrorMsg('Failed to process key fob scan.');
    }
  };

  const resetKiosk = (delay = 0) => {
    setTimeout(() => {
      setStep('SELECT_STAFF');
      setSelectedStaff(null);
      setSelectedRoom(null);
      setSearchQuery('');
      setStatusMsg('');
      setErrorMsg('');
      bufferRef.current = '';
    }, delay);
  };

  const availableRooms = allRooms.filter((r) => r.status === 'AVAILABLE');
  const filteredStaff = staffList.filter((s) =>
    (s.full_name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))] text-slate-100 p-4 font-sans flex flex-col justify-between max-w-md mx-auto">
      {/* HEADER & GLASS 8-ROOM GRID */}
      <div className="py-2 border-b border-white/10">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300 uppercase">
            DPC STAFF HOUSE MONITORING
          </h1>
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
        </div>

        {/* GLASSROOM DASHBOARD GRID */}
        <div className="grid grid-cols-4 gap-2 bg-white/5 backdrop-blur-xl p-2.5 rounded-2xl border border-white/10 shadow-2xl">
          {allRooms.slice(0, 8).map((room) => {
            const isOccupied = room.status === 'OCCUPIED';
            return (
              <div
                key={room.id}
                className={`p-2 rounded-xl text-center flex flex-col justify-between min-h-[75px] border transition-all duration-300 ${
                  isOccupied
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.1)]'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-black">
                  <span className="tracking-tight">R-{room.room_number}</span>
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isOccupied ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
                    }`}
                  />
                </div>

                <div className="flex flex-col justify-center my-1">
                  {isOccupied ? (
                    <>
                      <span className="text-[10px] font-bold text-amber-300 truncate block">
                        👤 {room.occupant_name || 'Occupied'}
                      </span>
                      <span className="text-[8px] text-slate-400 font-mono block">
                        {formatCheckInTime(room.checked_in_at)}
                      </span>
                      <span className="text-[8px] text-amber-400 font-semibold block mt-0.5">
                        ⏱️ {calculateDuration(room.checked_in_at)}
                      </span>
                    </>
                  ) : (
                    <span className="text-emerald-400/80 uppercase tracking-widest text-[8px] font-extrabold py-2">
                      Vacant
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {errorMsg && (
        <div className="bg-rose-500/10 border border-rose-500/40 text-rose-300 p-3 rounded-xl text-center text-xs my-2 backdrop-blur-md">
          ⚠️ {errorMsg}
        </div>
      )}

      {/* STEP 1: SELECT STAFF */}
      {step === 'SELECT_STAFF' && (
        <div className="flex-1 my-3 flex flex-col">
          <div className="mb-3 sticky top-0 z-10 pt-1">
            <input
              type="text"
              placeholder="🔍 Search name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-400 text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500/60 backdrop-blur-xl shadow-lg transition"
            />
          </div>

          <div className="grid grid-cols-1 gap-2 overflow-y-auto max-h-[42vh] pr-1">
            {filteredStaff.length > 0 ? (
              filteredStaff.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setSelectedStaff(s); setStep('SELECT_ROOM'); }}
                  className="w-full bg-white/5 hover:bg-blue-600/80 p-4 rounded-xl text-left font-medium text-base border border-white/10 active:scale-98 transition-all duration-200 backdrop-blur-lg flex items-center justify-between group"
                >
                  <span className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-white/10 group-hover:bg-white/20">👤</span> 
                    {s.full_name}
                  </span>
                  <span className="text-slate-500 group-hover:text-white transition">→</span>
                </button>
              ))
            ) : (
              <p className="text-slate-500 text-xs text-center py-6">No staff members found.</p>
            )}
          </div>
        </div>
      )}

      {/* STEP 2: SELECT ROOM */}
      {step === 'SELECT_ROOM' && (
        <div className="flex-1 my-4 flex flex-col justify-center text-center">
          <p className="text-blue-400 font-medium mb-1">Welcome, {selectedStaff?.full_name}</p>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Select an Available Room</h2>
          
          {availableRooms.length === 0 ? (
            <p className="text-amber-400 text-sm py-4">No vacant rooms currently available.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {availableRooms.map((r) => (
                <button
                  key={r.id}
                  onClick={() => { setSelectedRoom(r); setStep('SCAN_KEY'); }}
                  className="bg-emerald-600/90 hover:bg-emerald-500 p-5 rounded-2xl text-xl font-black border border-emerald-400/40 active:scale-95 transition shadow-lg shadow-emerald-950/50"
                >
                  Room {r.room_number}
                </button>
              ))}
            </div>
          )}
          
          <button onClick={() => resetKiosk(0)} className="mt-6 text-xs text-slate-400 hover:text-white underline">Cancel / Back</button>
        </div>
      )}

      {/* STEP 3: SCAN KEY */}
      {step === 'SCAN_KEY' && (
        <div className="flex-1 my-4 flex flex-col items-center justify-center text-center p-8 bg-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-2xl">
          <div className="animate-bounce text-5xl mb-4">🔑</div>
          <h2 className="text-xl font-bold text-white mb-2">Room {selectedRoom?.room_number} Selected</h2>
          <p className="text-xs text-slate-300 mb-6 max-w-xs leading-relaxed">
            Grab <span className="text-amber-400 font-bold">Key {selectedRoom?.room_number}</span> from the rack and tap its fob on the scanner below.
          </p>

          <button onClick={() => resetKiosk(0)} className="text-xs text-slate-400 hover:text-white underline">Cancel</button>
        </div>
      )}

      {/* STEP 4: SUCCESS */}
      {step === 'SUCCESS' && (
        <div className="flex-1 my-4 flex flex-col items-center justify-center text-center p-6 bg-emerald-500/10 backdrop-blur-2xl rounded-3xl border border-emerald-500/40 shadow-2xl">
          <div className="text-4xl mb-2">🎉</div>
          <h2 className="text-base font-bold text-emerald-300">{statusMsg}</h2>
        </div>
      )}

      {/* FOOTER */}
      <div className="text-center text-[10px] text-slate-500 border-t border-white/10 pt-2 flex items-center justify-between">
        <span>System Operational</span>
        <span className="font-mono text-emerald-400/80">USB Reader Active</span>
      </div>
    </div>
  );
}
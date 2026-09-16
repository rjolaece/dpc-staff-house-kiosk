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
  return `${Math.floor(diffInMs / (1000 * 60 * 60 * 24))}d`;
};

// Formats timestamp to: "Sep 16, 2026 0834H"
const formatCheckInTime = (checkedInAt) => {
  if (!checkedInAt) return '';
  const date = parseLocalDate(checkedInAt);
  
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const day = date.getDate();
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${month} ${day}, ${year} ${hours}${minutes}H`;
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
      setErrorMsg('Failed to load initial data.');
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
          staff_id: selectedStaff?.id || null,
          guest_name: selectedStaff?.id ? null : selectedStaff?.full_name,
          room_id: selectedRoom?.id,
        }),
      });

      const text = await res.text();
      const data = text ? JSON.parse(text) : {};

      if (!res.ok) {
        setErrorMsg(data.error || 'Scan failed.');
        return;
      }

      setStatusMsg(data.message || 'Action completed successfully!');
      setStep('SUCCESS');
      resetKiosk(3000);
    } catch (err) {
      setErrorMsg('Failed to process scan.');
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

  const availableRooms = allRooms.filter((r) => r.status !== 'FULL');
  const filteredStaff = staffList.filter((s) =>
    (s.full_name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 font-sans flex flex-col justify-between max-w-md mx-auto">
      {/* HEADER & MULTI-OCCUPANT ROOM RACK */}
      <div className="py-2 border-b border-white/10">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300 uppercase">
            DPC STAFF HOUSE MONITORING
          </h1>
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        </div>

        {/* 8-ROOM GRID DISPLAY */}
        <div className="grid grid-cols-4 gap-2 bg-white/5 p-2 rounded-2xl border border-white/10 shadow-2xl">
          {allRooms.slice(0, 8).map((room) => {
            const isFull = room.status === 'FULL';
            const isPartial = room.status === 'PARTIAL';

            return (
              <div
                key={room.id}
                className={`p-1.5 rounded-xl text-center flex flex-col justify-between min-h-[115px] border transition-all ${
                  isFull
                    ? 'bg-rose-500/10 border-rose-500/40 text-rose-200'
                    : isPartial
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                }`}
              >
                {/* Header: Room Number & Capacity Counter */}
                <div className="flex items-center justify-between text-[10px] font-black border-b border-white/10 pb-1">
                  <span>R-{room.room_number}</span>
                  <span className="font-mono text-[9px] opacity-80">
                    {room.occupant_count}/{room.max_capacity}
                  </span>
                </div>

                {/* Occupant Names & Check-in Time */}
                <div className="flex flex-col justify-start gap-1 my-1 overflow-y-auto max-h-[75px]">
                  {room.occupants && room.occupants.length > 0 ? (
                    room.occupants.map((occ, idx) => (
                      <div key={idx} className="bg-black/30 rounded p-1 text-[7.5px] text-left leading-tight">
                        <div className="font-bold truncate text-slate-200">👤 {occ.staff_name}</div>
                        
                        {/* Single-line timestamp */}
                        <div className="text-[6.5px] text-slate-400 font-mono mt-0.5 whitespace-nowrap truncate">
                          {formatCheckInTime(occ.checked_in_at)}
                        </div>

                        <div className="flex justify-between items-center text-amber-400 font-mono text-[7px] mt-0.5">
                          <span>{calculateDuration(occ.checked_in_at)}</span>
                          <button
                            onClick={() => handleFobScan(occ.fob_uid || occ.assignment_id)}
                            className="text-rose-400 hover:underline font-bold"
                          >
                            Out
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <span className="text-emerald-400/80 uppercase tracking-widest text-[8px] font-extrabold py-4">
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
        <div className="bg-rose-500/10 border border-rose-500/40 text-rose-300 p-3 rounded-xl text-center text-xs my-2">
          ⚠️ {errorMsg}
        </div>
      )}

      {/* STEP 1: SELECT STAFF OR GUEST */}
      {step === 'SELECT_STAFF' && (
        <div className="flex-1 my-3 flex flex-col">
          <div className="mb-3 sticky top-0 z-10 pt-1 flex flex-col gap-2">
            <input
              type="text"
              placeholder="🔍 Search name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-400 text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500/60"
            />

            {/* SEAMLESS GLASSMORPHIC GUEST BUTTONS */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: '+ DPCC Guest', prefix: 'DPCC Guest: ' },
                { label: '+ Visitor', prefix: 'Visitor: ' },
                { label: '+ Contractor', prefix: 'Contractor: ' },
              ].map((type) => (
                <button
                  key={type.label}
                  onClick={() => {
                    const name = prompt(`Enter ${type.label.replace('+', '').trim()} Name:`);
                    if (name && name.trim()) {
                      setSelectedStaff({ id: null, full_name: `${type.prefix}${name.trim()}` });
                      setStep('SELECT_ROOM');
                    }
                  }}
                  className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-500/40 text-slate-300 hover:text-white text-[11px] font-semibold py-2.5 rounded-xl text-center active:scale-95 transition backdrop-blur-md shadow-sm"
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 overflow-y-auto max-h-[35vh] pr-1">
            {filteredStaff.length > 0 ? (
              filteredStaff.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setSelectedStaff(s); setStep('SELECT_ROOM'); }}
                  className="w-full bg-white/5 hover:bg-blue-600/80 p-4 rounded-xl text-left font-medium text-base border border-white/10 flex items-center justify-between"
                >
                  <span>👤 {s.full_name}</span>
                  <span className="text-slate-500">→</span>
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
          
          <div className="grid grid-cols-2 gap-3">
            {availableRooms.map((r) => (
              <button
                key={r.id}
                onClick={() => { setSelectedRoom(r); setStep('SCAN_KEY'); }}
                className="bg-emerald-600/90 hover:bg-emerald-500 p-4 rounded-2xl text-left font-black border border-emerald-400/40"
              >
                <div className="text-lg">Room {r.room_number}</div>
                <div className="text-xs text-emerald-100 font-normal">
                  Occupancy: {r.occupant_count}/{r.max_capacity}
                </div>
              </button>
            ))}
          </div>
          
          <button onClick={() => resetKiosk(0)} className="mt-6 text-xs text-slate-400 underline">Cancel / Back</button>
        </div>
      )}

      {/* STEP 3: SCAN KEY */}
      {step === 'SCAN_KEY' && (
        <div className="flex-1 my-4 flex flex-col items-center justify-center text-center p-6 bg-white/5 rounded-3xl border border-white/10">
          <div className="animate-bounce text-4xl mb-3">🔑</div>
          <h2 className="text-lg font-bold text-white mb-1">Room {selectedRoom?.room_number} Selected</h2>
          <p className="text-xs text-slate-300 mb-4">
            Tap key fob on scanner to assign <span className="text-amber-400 font-bold">{selectedStaff?.full_name}</span>.
          </p>

          <button
            onClick={() => handleFobScan(selectedRoom?.room_number || '101')}
            className="mb-4 px-3 py-2 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-xl text-xs font-mono"
          >
            ⚡ Dev Sim: Tap Fob {selectedRoom?.room_number}
          </button>

          <button onClick={() => resetKiosk(0)} className="text-xs text-slate-400 underline">Cancel</button>
        </div>
      )}

      {/* STEP 4: SUCCESS */}
      {step === 'SUCCESS' && (
        <div className="flex-1 my-4 flex flex-col items-center justify-center text-center p-6 bg-emerald-500/10 rounded-3xl border border-emerald-500/40">
          <div className="text-4xl mb-2">🎉</div>
          <h2 className="text-base font-bold text-emerald-300">{statusMsg}</h2>
        </div>
      )}

      {/* FOOTER */}
      <div className="text-center text-[10px] text-slate-500 border-t border-white/10 pt-2 flex items-center justify-between">
        <span>System Operational</span>
        <span className="font-mono text-emerald-400/80">Multi-Occupancy Active</span>
      </div>
    </div>
  );
}
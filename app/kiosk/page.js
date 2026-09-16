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
  const [rfidDetected, setRfidDetected] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  const disconnectTimerRef = useRef(null);

  useEffect(() => {
    fetchInitialData();

    if (typeof window !== 'undefined' && 'navigator' in window && 'hid' in navigator) {
      navigator.hid.getDevices().then((devices) => {
        setRfidDetected(devices.length > 0);
      });

      const handleConnect = () => setRfidDetected(true);
      const handleDisconnect = () => setRfidDetected(false);

      navigator.hid.addEventListener('connect', handleConnect);
      navigator.hid.addEventListener('disconnect', handleDisconnect);

      return () => {
        navigator.hid.removeEventListener('connect', handleConnect);
        navigator.hid.removeEventListener('disconnect', handleDisconnect);
      };
    }
  }, [step]);

  const fetchInitialData = async () => {
    setIsRefreshing(true);
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
    } finally {
      setTimeout(() => setIsRefreshing(false), 1000);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (document.activeElement.tagName === 'INPUT') return;

      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTimeRef.current;
      lastKeyTimeRef.current = currentTime;

      if (timeDiff > 0 && timeDiff < 50) {
        setRfidDetected(true);

        if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = setTimeout(() => {
          setRfidDetected(false);
        }, 10000);
      }

      if (e.key === 'Enter') {
        const scannedCode = bufferRef.current.trim();
        if (scannedCode) handleFobScan(scannedCode);
        bufferRef.current = '';
      } else if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
    };
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
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 lg:p-6 font-sans flex flex-col justify-between max-w-md md:max-w-4xl lg:max-w-7xl mx-auto">
      
      {/* HEADER SECTION - SINGLE LINE TITLE WITH REFRESH BUTTON */}
      <div className="py-2 border-b border-white/10 flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-3 truncate">
          <h1 className="text-base sm:text-lg md:text-xl lg:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300 uppercase tracking-wider whitespace-nowrap truncate">
            DPCC STAFF HOUSE MONITORING
          </h1>

          {/* REFRESH BUTTON */}
          <button
            onClick={fetchInitialData}
            title="Refresh Data"
            disabled={isRefreshing}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all duration-300 backdrop-blur-md shadow-sm disabled:opacity-80 ${
              isRefreshing 
                ? 'bg-blue-600/30 border-blue-400 text-blue-300 ring-2 ring-blue-500/50' 
                : 'bg-white/5 hover:bg-white/10 border-white/10 hover:border-blue-400/40 text-slate-300 hover:text-white active:scale-95'
            }`}
          >
            <svg
              className={`w-3.5 h-3.5 transition-transform duration-700 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
            <span className="text-xs font-semibold tracking-wide">
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-emerald-400 font-mono hidden sm:inline">LIVE KIOSK</span>
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>
      </div>

      {errorMsg && (
        <div className="bg-rose-500/10 border border-rose-500/40 text-rose-300 p-3 rounded-xl text-center text-xs my-2 backdrop-blur-md">
          ⚠️ {errorMsg}
        </div>
      )}

      {/* MAIN CONTAINER */}
      <div className="flex-1 my-2 grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">

        {/* LEFT COLUMN: 8-ROOM GRID DISPLAY */}
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider px-1 mb-2">
            <span>Room Overview</span>
            <span className="text-[10px] font-mono text-slate-500">8 Rooms Total</span>
          </div>

          <div 
            className={`grid grid-cols-4 gap-2.5 p-3 rounded-2xl border flex-1 items-stretch transition-all duration-500 ${
              isRefreshing 
                ? 'bg-blue-900/20 border-blue-400/60 ring-2 ring-blue-500/50 shadow-[0_0_35px_rgba(59,130,246,0.35)] animate-pulse' 
                : 'bg-white/5 border-white/10 shadow-2xl backdrop-blur-xl'
            }`}
          >
            {allRooms.slice(0, 8).map((room) => {
              const isFull = room.status === 'FULL';
              const isPartial = room.status === 'PARTIAL';

              return (
                <div
                  key={room.id}
                  className={`p-2.5 rounded-xl text-center flex flex-col justify-between min-h-[130px] lg:min-h-[190px] border transition-all ${
                    isFull
                      ? 'bg-rose-500/10 border-rose-500/40 text-rose-200'
                      : isPartial
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  }`}
                >
                  {/* Header: Room Number & Capacity Counter */}
                  <div className="flex items-center justify-between text-[11px] lg:text-xs font-black border-b border-white/10 pb-1.5">
                    <span>R-{room.room_number}</span>
                    <span className="font-mono text-[10px] opacity-80">
                      {room.occupant_count}/{room.max_capacity}
                    </span>
                  </div>

                  {/* VERTICALLY ALIGNED OCCUPANTS CONTAINER */}
                  {room.occupants && room.occupants.length > 0 ? (
                    <div className="flex flex-col gap-1.5 my-auto overflow-auto max-h-[120px] lg:max-h-[145px] py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {room.occupants.map((occ, idx) => (
                        <div 
                          key={idx} 
                          className="w-full bg-black/40 rounded-lg p-2 text-[8.5px] text-left leading-tight border border-white/5 shadow-inner flex flex-col justify-between shrink-0 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                        >
                          <div className="font-bold whitespace-nowrap text-slate-100">👤 {occ.staff_name}</div>
                          
                          <div className="text-[7px] text-slate-400 font-mono mt-1 whitespace-nowrap">
                            {formatCheckInTime(occ.checked_in_at)}
                          </div>

                          <div className="flex justify-between items-center text-amber-400 font-mono text-[7.5px] mt-1.5 whitespace-nowrap">
                            <span>{calculateDuration(occ.checked_in_at)}</span>
                            <button
                              onClick={() => handleFobScan(occ.fob_uid || occ.assignment_id)}
                              className="text-rose-400 hover:text-rose-300 hover:underline font-bold ml-2"
                            >
                              Out
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-emerald-400/80 uppercase tracking-widest text-[9px] font-extrabold my-auto py-8 block text-center">
                      Vacant
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN: UNIFIED INTERACTIVE PANEL */}
        <div className="flex flex-col h-full">
          
          {/* STEP 1: SELECT STAFF OR GUEST */}
          {step === 'SELECT_STAFF' && (
            <div 
              className={`flex-1 flex flex-col p-4 rounded-2xl border h-full transition-all duration-500 ${
                isRefreshing 
                  ? 'bg-blue-900/20 border-blue-400/60 ring-2 ring-blue-500/50 shadow-[0_0_35px_rgba(59,130,246,0.35)] animate-pulse' 
                  : 'bg-white/5 border-white/10 shadow-2xl backdrop-blur-xl'
              }`}
            >
              
              {/* Top Controls: Search & Guest Buttons */}
              <div className="flex flex-col gap-2.5 mb-3">
                <input
                  type="text"
                  placeholder="🔍 Search name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900/60 border border-white/10 text-white placeholder-slate-400 text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500/60 transition shadow-inner"
                />

                {/* Glassmorphic Guest Buttons */}
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
                      className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-500/40 text-slate-300 hover:text-white text-[11px] font-semibold py-2.5 rounded-xl text-center active:scale-95 transition shadow-sm"
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Staff List */}
              <div className="flex-1 grid grid-cols-1 gap-2 overflow-y-auto max-h-[360px] lg:max-h-[420px] pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {filteredStaff.length > 0 ? (
                  filteredStaff.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { setSelectedStaff(s); setStep('SELECT_ROOM'); }}
                      className="w-full bg-white/5 hover:bg-blue-600/80 p-3.5 rounded-xl text-left font-medium text-sm md:text-base border border-white/10 flex items-center justify-between group transition-all active:scale-98"
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="p-1.5 rounded-lg bg-white/10 group-hover:bg-white/20">👤</span>
                        {s.full_name}
                      </span>
                      <span className="text-slate-500 group-hover:text-white transition">→</span>
                    </button>
                  ))
                ) : (
                  <p className="text-slate-500 text-xs text-center py-8">No staff members found.</p>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: SELECT ROOM */}
          {step === 'SELECT_ROOM' && (
            <div className="flex-1 flex flex-col justify-center text-center bg-white/5 p-6 rounded-2xl border border-white/10 backdrop-blur-xl shadow-2xl h-full">
              <p className="text-blue-400 font-medium text-base mb-1">Welcome, {selectedStaff?.full_name}</p>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6">Select an Available Room</h2>
              
              <div className="grid grid-cols-2 gap-4">
                {availableRooms.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => { setSelectedRoom(r); setStep('SCAN_KEY'); }}
                    className="bg-emerald-600/90 hover:bg-emerald-500 p-5 rounded-2xl text-left font-black border border-emerald-400/40 shadow-lg active:scale-95 transition"
                  >
                    <div className="text-xl">Room {r.room_number}</div>
                    <div className="text-xs text-emerald-100 font-normal mt-1">
                      Occupancy: {r.occupant_count}/{r.max_capacity}
                    </div>
                  </button>
                ))}
              </div>
              
              <button onClick={() => resetKiosk(0)} className="mt-8 text-xs text-slate-400 hover:text-white underline transition">
                Cancel / Back
              </button>
            </div>
          )}

          {/* STEP 3: SCAN KEY */}
          {step === 'SCAN_KEY' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-xl shadow-2xl h-full">
              <div className="animate-bounce text-5xl mb-4">🔑</div>
              <h2 className="text-xl font-bold text-white mb-2">Room {selectedRoom?.room_number} Selected</h2>
              <p className="text-sm text-slate-300 mb-6 max-w-xs">
                Tap key fob on scanner to assign <span className="text-amber-400 font-bold">{selectedStaff?.full_name}</span>.
              </p>

              <button
                onClick={() => handleFobScan(selectedRoom?.room_number || '101')}
                className="mb-6 px-5 py-2.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-xl text-xs font-mono hover:bg-amber-500/30 transition active:scale-95"
              >
                ⚡ Dev Sim: Tap Fob {selectedRoom?.room_number}
              </button>

              <button onClick={() => resetKiosk(0)} className="text-xs text-slate-400 hover:text-white underline transition">
                Cancel
              </button>
            </div>
          )}

          {/* STEP 4: SUCCESS */}
          {step === 'SUCCESS' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-emerald-500/10 rounded-2xl border border-emerald-500/40 backdrop-blur-xl shadow-2xl h-full">
              <div className="text-6xl mb-4">🎉</div>
              <h2 className="text-lg md:text-xl font-bold text-emerald-300">{statusMsg}</h2>
            </div>
          )}

        </div>
      </div>

      {/* FOOTER WITH RFID SCANNER STATUS */}
      <div className="text-center text-[10px] md:text-xs text-slate-500 border-t border-white/10 pt-3 flex items-center justify-between mt-2">
        <span>System Operational</span>
        <span className="font-mono flex items-center gap-1.5">
          {rfidDetected ? (
            <span className="text-emerald-400 font-semibold">RFID Scanner: Connected 🟢</span>
          ) : (
            <span className="text-slate-400 font-semibold">RFID Scanner: Disconnected 🔴</span>
          )}
        </span>
      </div>
    </div>
  );
}
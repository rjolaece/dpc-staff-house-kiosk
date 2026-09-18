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

// Groups room occupants strictly by key fob or check-in transaction timestamp
const groupOccupantsByTransaction = (occupants = []) => {
  if (!occupants || occupants.length === 0) return [];

  const groupsMap = new Map();

  occupants.forEach((occ) => {
    const rawTime = occ.checked_in_at || occ.check_in || occ.created_at || '';
    const timeKey = rawTime ? rawTime.substring(0, 16) : '';
    const groupKey = occ.fob_uid || timeKey || occ.assignment_id || occ.id;

    const displayName = occ.staff_name || occ.guest_name || occ.full_name || 'Occupant';
    const assignmentId = occ.assignment_id || occ.id;

    if (!groupsMap.has(groupKey)) {
      groupsMap.set(groupKey, {
        groupKey,
        fob_uid: occ.fob_uid || 'SYSTEM_AUTO',
        checked_in_at: rawTime,
        names: [displayName],
        assignment_ids: [assignmentId],
      });
    } else {
      const existing = groupsMap.get(groupKey);
      if (displayName && !existing.names.includes(displayName)) {
        existing.names.push(displayName);
      }
      if (assignmentId && !existing.assignment_ids.includes(assignmentId)) {
        existing.assignment_ids.push(assignmentId);
      }
    }
  });

  return Array.from(groupsMap.values());
};

export default function PhoneKiosk() {
  const [step, setStep] = useState('SELECT_STAFF');
  const [staffList, setStaffList] = useState([]);
  const [allRooms, setAllRooms] = useState([]);
  
  const [selectedPersons, setSelectedPersons] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const bufferRef = useRef('');

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
    } catch {
      setErrorMsg('Failed to load initial data.');
    } finally {
      setTimeout(() => setIsRefreshing(false), 4000);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  // Collect set of staff_ids and names currently checked into any room
  const activeOccupantSet = new Set();
  allRooms.forEach((r) => {
    if (r.occupants) {
      r.occupants.forEach((occ) => {
        if (occ.staff_id) activeOccupantSet.add(occ.staff_id);
        const name = occ.staff_name || occ.guest_name || occ.full_name;
        if (name) activeOccupantSet.add(name.toLowerCase());
      });
    }
  });

  const handleFobScan = async (fobUid) => {
    setErrorMsg('');
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key_fob_uid: fobUid,
          persons: selectedPersons.map((p) => ({
            staff_id: p.id || null,
            guest_name: p.id ? null : p.full_name,
          })),
          room_id: selectedRoom?.id || null,
        }),
      });

      const text = await res.text();
      const data = text ? JSON.parse(text) : {};

      if (!res.ok) {
        setErrorMsg(data.error || 'Scan action failed.');
        return;
      }

      setStatusMsg(data.message || 'Action completed successfully!');
      setStep('SUCCESS');
      fetchInitialData();
      resetKiosk(3000);
    } catch {
      setErrorMsg('Failed to process scan.');
    }
  };

  const handleCheckOut = async (assignmentIds, fobUid) => {
    setErrorMsg('');
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignment_ids: assignmentIds,
          key_fob_uid: fobUid,
        }),
      });

      const text = await res.text();
      const data = text ? JSON.parse(text) : {};

      if (!res.ok) {
        setErrorMsg(data.error || 'Checkout failed.');
        return;
      }

      setStatusMsg(data.message || 'Successfully checked out!');
      setStep('SUCCESS');
      fetchInitialData();
      resetKiosk(3000);
    } catch {
      setErrorMsg('Failed to process checkout.');
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
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedPersons, selectedRoom]);

  const toggleStaffSelection = (staff) => {
    if (activeOccupantSet.has(staff.id)) return;

    setSelectedPersons((prev) => {
      const exists = prev.some((p) => p.id === staff.id && p.id !== null);
      if (exists) {
        return prev.filter((p) => p.id !== staff.id);
      }
      return [...prev, { id: staff.id, full_name: staff.full_name }];
    });
  };

  const removePerson = (indexToRemove) => {
    setSelectedPersons((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const resetKiosk = (delay = 0) => {
    setTimeout(() => {
      setStep('SELECT_STAFF');
      setSelectedPersons([]);
      setSelectedRoom(null);
      setSearchQuery('');
      setStatusMsg('');
      setErrorMsg('');
      bufferRef.current = '';
    }, delay);
  };

  const filteredStaff = staffList.filter((s) =>
    (s.full_name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 lg:p-6 font-sans flex flex-col justify-between max-w-md md:max-w-4xl lg:max-w-7xl mx-auto">
      
      {/* HEADER SECTION */}
      <div className="py-2 border-b border-white/10 flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-3 truncate">
          <h1 className="text-base sm:text-lg md:text-xl lg:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300 uppercase tracking-wider whitespace-nowrap truncate">
            DPCC STAFF HOUSE MONITORING
          </h1>

          <button
            onClick={fetchInitialData}
            title="Refresh Data"
            disabled={isRefreshing}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all duration-500 backdrop-blur-md shadow-sm disabled:opacity-80 ${
              isRefreshing 
                ? 'bg-blue-600/30 border-cyan-400 text-cyan-300 ring-2 ring-blue-500/50' 
                : 'bg-white/5 hover:bg-white/10 border-white/10 hover:border-blue-400/40 text-slate-300 hover:text-white active:scale-95'
            }`}
          >
            <svg
              className={`w-3.5 h-3.5 transition-transform duration-1000 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`}
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

          <div className="relative rounded-2xl flex-1 flex">
            <div 
              className={`absolute inset-[-15px] rounded-3xl bg-gradient-to-r from-cyan-500/40 via-blue-600/50 to-indigo-500/40 blur-3xl pointer-events-none transition-all duration-1000 ease-out ${
                isRefreshing 
                  ? 'opacity-80 scale-100 animate-pulse' 
                  : 'opacity-0 scale-95'
              }`} 
            />

            <div className="grid grid-cols-4 gap-2.5 p-3 rounded-2xl border border-white/10 shadow-2xl backdrop-blur-xl bg-slate-950/80 flex-1 items-stretch relative z-10">
              {allRooms.slice(0, 8).map((room) => {
                const isOverbooked = room.occupant_count > room.max_capacity;
                const isFull = room.status === 'FULL' || room.occupant_count >= room.max_capacity;
                const isPartial = room.status === 'PARTIAL' && !isFull;
                const checkInGroups = groupOccupantsByTransaction(room.occupants);

                return (
                  <div
                    key={room.id}
                    className={`p-2.5 rounded-xl text-center flex flex-col justify-between min-h-[130px] lg:min-h-[190px] border transition-all ${
                      isOverbooked
                        ? 'bg-rose-500/20 border-rose-500 border-2 animate-pulse shadow-lg shadow-rose-500/20 text-rose-200 ring-1 ring-rose-500/50'
                        : isFull
                        ? 'bg-rose-500/10 border-rose-500/40 text-rose-200'
                        : isPartial
                        ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] lg:text-xs font-black border-b border-white/10 pb-1.5">
                      <span>R-{room.room_number}</span>
                      <span className="font-mono text-[10px] opacity-80">
                        {room.occupant_count}/{room.max_capacity}
                      </span>
                    </div>

                    {checkInGroups && checkInGroups.length > 0 ? (
                      <div className="flex flex-col gap-1.5 my-auto overflow-auto max-h-[120px] lg:max-h-[145px] py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {checkInGroups.map((group, idx) => (
                          <div 
                            key={idx} 
                            className="w-full bg-black/40 rounded-lg p-2 text-[8.5px] text-left leading-tight border border-white/5 shadow-inner flex flex-col justify-between shrink-0"
                          >
                            <div className="font-bold text-slate-100 leading-snug">
                              {group.names.length > 1 ? '👥 ' : '👤 '}
                              {group.names.join(', ')}
                            </div>
                            
                            <div className="text-[7px] text-slate-400 font-mono mt-1 whitespace-nowrap">
                              {formatCheckInTime(group.checked_in_at)}
                            </div>

                            <div className="flex justify-between items-center text-amber-400 font-mono text-[7.5px] mt-1.5 whitespace-nowrap">
                              <span>{calculateDuration(group.checked_in_at)}</span>
                              <button
                                onClick={() => handleCheckOut(group.assignment_ids, group.fob_uid)}
                                className="text-rose-400 hover:text-rose-300 hover:underline font-bold ml-2 cursor-pointer"
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
        </div>

        {/* RIGHT COLUMN: MULTI-PERSON INTERACTIVE PANEL */}
        <div className="flex flex-col h-full">
          
          {step === 'SELECT_STAFF' && (
            <div className="relative rounded-2xl h-full flex">
              <div 
                className={`absolute inset-[-15px] rounded-3xl bg-gradient-to-r from-cyan-500/40 via-blue-600/50 to-indigo-500/40 blur-3xl pointer-events-none transition-all duration-1000 ease-out ${
                  isRefreshing 
                    ? 'opacity-80 scale-100 animate-pulse' 
                    : 'opacity-0 scale-95'
                }`} 
              />

              <div className="flex-1 flex flex-col p-4 rounded-2xl border border-white/10 shadow-2xl backdrop-blur-xl bg-slate-950/80 h-full relative z-10 justify-between">
                
                <div className="flex flex-col gap-2.5 mb-3">
                  <input
                    type="text"
                    placeholder="🔍 Search name to select..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-900/60 border border-white/10 text-white placeholder-slate-400 text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500/60 transition shadow-inner"
                  />

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
                            const fullName = `${type.prefix}${name.trim()}`;
                            if (activeOccupantSet.has(fullName.toLowerCase())) {
                              setErrorMsg(`"${fullName}" is already checked into a room.`);
                              return;
                            }
                            setSelectedPersons((prev) => [
                              ...prev,
                              { id: null, full_name: fullName },
                            ]);
                          }
                        }}
                        className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-500/40 text-slate-300 hover:text-white text-[11px] font-semibold py-2.5 rounded-xl text-center active:scale-95 transition shadow-sm"
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                </div>

               {selectedPersons.length > 0 && (
  <div className="mb-3 p-2.5 bg-transparent border border-blue-500/40 rounded-xl">
    <div className="text-[10px] uppercase font-bold text-blue-300 mb-1.5 flex justify-between items-center">
      <span>Selected Persons ({selectedPersons.length})</span>
      <button onClick={() => setSelectedPersons([])} className="text-rose-400 hover:underline">Clear All</button>
    </div>
    <div className="flex flex-wrap gap-1.5 max-h-[80px] overflow-y-auto">
      {selectedPersons.map((p, idx) => (
        <span key={idx} className="bg-transparent text-white text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5 border border-blue-400/50">
          <span>👤 {p.full_name}</span>
          <button onClick={() => removePerson(idx)} className="text-blue-300 hover:text-white font-bold ml-1">✕</button>
        </span>
      ))}
    </div>
  </div>
)}

                <div className="flex-1 grid grid-cols-1 gap-2 overflow-y-auto max-h-[300px] lg:max-h-[360px] pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {filteredStaff.length > 0 ? (
                    filteredStaff.map((s) => {
                      const isSelected = selectedPersons.some((p) => p.id === s.id && p.id !== null);
                      const isAlreadyCheckedIn = activeOccupantSet.has(s.id);

                      return (
<button
  key={s.id}
  disabled={isAlreadyCheckedIn}
  onClick={() => toggleStaffSelection(s)}
  className={`w-full p-3 rounded-xl text-left font-medium text-sm md:text-base border flex items-center justify-between transition-all ${
    isAlreadyCheckedIn
      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300/60 cursor-not-allowed opacity-60'
      : isSelected
      ? 'bg-blue-500/20 border-blue-500/50 text-blue-200 shadow-md backdrop-blur-md active:scale-98'
      : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-200 active:scale-98'
  }`}
>
  <span className="flex items-center gap-2.5">
    <span className="p-1 rounded-lg bg-white/10">👤</span>
    {s.full_name}
  </span>
  <span className={`text-xs font-mono px-2 py-0.5 rounded ${
    isSelected ? 'bg-blue-500/30 text-blue-300 border border-blue-400/40' : 'bg-black/30 text-slate-300'
  }`}>
    {isAlreadyCheckedIn ? 'Checked In 🟢' : isSelected ? '✓ Selected' : '+ Add'}
  </span>
</button>
                      );
                    })
                  ) : (
                    <p className="text-slate-500 text-xs text-center py-8">No staff members found.</p>
                  )}
                </div>

                <button
                  onClick={() => setStep('SELECT_ROOM')}
                  disabled={selectedPersons.length === 0}
                  className="mt-3 w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm shadow-xl transition active:scale-95 flex items-center justify-center gap-2"
                >
                  <span>Proceed to Select Room ({selectedPersons.length})</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          )}

          {step === 'SELECT_ROOM' && (
            <div className="flex-1 flex flex-col justify-center text-center bg-white/5 p-6 rounded-2xl border border-white/10 backdrop-blur-xl shadow-2xl h-full">
              <p className="text-blue-400 font-medium text-base mb-1">
                Checking in: {selectedPersons.map((p) => p.full_name).join(', ')}
              </p>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6">
                Select a Room (Registering {selectedPersons.length} Person{selectedPersons.length > 1 ? 's' : ''})
              </h2>
              
              <div className="grid grid-cols-2 gap-4 max-h-[380px] overflow-y-auto pr-1">
                {allRooms.map((r) => {
                  const availableSpace = r.max_capacity - r.occupant_count;
                  const isOverCapacity = availableSpace < selectedPersons.length;

                  return (
                    <button
                      key={r.id}
                      onClick={() => { setSelectedRoom(r); setStep('SCAN_KEY'); }}
                      className={`p-5 rounded-2xl text-left font-black border shadow-lg active:scale-95 transition ${
                        isOverCapacity
                          ? 'bg-rose-950/30 border-rose-500/40 text-rose-200 opacity-60 hover:opacity-100 hover:border-rose-400'
                          : 'bg-emerald-600/90 hover:bg-emerald-500 border-emerald-400/40 text-emerald-100'
                      }`}
                    >
                      <div className="text-xl">Room {r.room_number}</div>
                      <div className="text-xs opacity-90 font-normal mt-1">
                        Available Space: {availableSpace} / {r.max_capacity}
                      </div>
                    </button>
                  );
                })}
              </div>
              
              <button onClick={() => setStep('SELECT_STAFF')} className="mt-8 text-xs text-slate-400 hover:text-white underline transition">
                Back to Person Selection
              </button>
            </div>
          )}

          {step === 'SCAN_KEY' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-xl shadow-2xl h-full">
              <div className="animate-bounce text-5xl mb-4">🔑</div>
              <h2 className="text-xl font-bold text-white mb-2">Room {selectedRoom?.room_number} Selected</h2>
              <p className="text-sm text-slate-300 mb-6 max-w-xs">
                Tap key fob on scanner to assign <span className="text-amber-400 font-bold">{selectedPersons.length} occupant(s)</span>.
              </p>

              <button onClick={() => resetKiosk(0)} className="text-xs text-slate-400 hover:text-white underline transition">
                Cancel
              </button>
            </div>
          )}

          {step === 'SUCCESS' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-emerald-500/10 rounded-2xl border border-emerald-500/40 backdrop-blur-xl shadow-2xl h-full">
              <div className="text-6xl mb-4">🎉</div>
              <h2 className="text-lg md:text-xl font-bold text-emerald-300">{statusMsg}</h2>
            </div>
          )}

        </div>
      </div>

      {/* FOOTER SECTION */}
      <div className="text-center text-[10px] md:text-xs text-slate-500 border-t border-white/10 pt-3 flex items-center justify-between mt-2">
        <span>System Operational</span>
        <span className="font-mono text-slate-400 font-semibold">
          Developed by: RVO
        </span>
      </div>
    </div>
  );
}
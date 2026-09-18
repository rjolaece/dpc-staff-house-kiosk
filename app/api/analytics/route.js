import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const key = 
    process.env.SUPABASE_SERVICE_ROLE_KEY || 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
    'placeholder-key';
    
  return createClient(url, key);
}

export async function GET() {
  try {
    const supabase = getSupabaseClient();

    const { data: assignments, error: aErr } = await supabase
      .from('room_assignments')
      .select('*');

    const { data: rooms, error: rErr } = await supabase
      .from('rooms')
      .select('*');

    const { data: staffList } = await supabase
      .from('staff')
      .select('id, full_name');

    if (aErr || rErr) {
      return NextResponse.json({ error: aErr?.message || rErr?.message }, { status: 500 });
    }

    const roomMap = new Map();
    (rooms || []).forEach((r) => roomMap.set(r.id, r));

    const staffMap = new Map();
    (staffList || []).forEach((s) => staffMap.set(s.id, s.full_name));

    const records = assignments || [];

    // 1. AVERAGE STAY DURATION PER ROOM (HOURS & DAYS)
    const roomStayTotals = {};
    const roomStayCounts = {};

    records.forEach((a) => {
      const checkInTime = a.check_in || a.checked_in_at || a.created_at;
      const checkOutTime = a.check_out;

      if (checkInTime && checkOutTime) {
        const roomObj = roomMap.get(a.room_id);
        const roomNum = roomObj ? roomObj.room_number : `${a.room_id}`;
        const durationHours = (new Date(checkOutTime) - new Date(checkInTime)) / (1000 * 60 * 60);

        if (durationHours > 0) {
          roomStayTotals[roomNum] = (roomStayTotals[roomNum] || 0) + durationHours;
          roomStayCounts[roomNum] = (roomStayCounts[roomNum] || 0) + 1;
        }
      }
    });

    const avgStayPerRoom = (rooms || []).map((r) => {
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

    // 2. RAW RECORD ATTACHMENTS FOR FRONTEND DATE FILTERING
    const processedAssignments = records.map((a) => {
      const checkInTime = a.check_in || a.checked_in_at || a.created_at;
      const dateObj = checkInTime ? new Date(checkInTime) : null;
      return {
        name: a.guest_name || staffMap.get(a.staff_id) || (a.staff_id ? `Staff #${a.staff_id}` : 'Guest'),
        year: dateObj ? dateObj.getFullYear() : null,
        month: dateObj ? dateObj.getMonth() + 1 : null,
        dateStr: checkInTime,
      };
    });

    const availableYears = Array.from(
      new Set(processedAssignments.map((a) => a.year).filter(Boolean))
    ).sort((a, b) => b - a);

    // 3. PEAK HOURS
    const checkInHourCounts = Array(24).fill(0);
    const checkOutHourCounts = Array(24).fill(0);

    records.forEach((a) => {
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

    const peakHours = checkInHourCounts.map((inCount, hr) => ({
      hour: `${String(hr).padStart(2, '0')}:00`,
      checkIns: inCount,
      checkOuts: checkOutHourCounts[hr],
    }));

    // 4. OVERBOOKING & TURNOVER FREQUENCY (GUARANTEED CALCULATION)
    const roomTurnover = {};
    records.forEach((a) => {
      const roomObj = roomMap.get(a.room_id);
      const roomNum = roomObj ? roomObj.room_number : `${a.room_id}`;
      roomTurnover[roomNum] = (roomTurnover[roomNum] || 0) + 1;
    });

    const roomTurnoverAndOverbook = (rooms || []).map((r) => {
      const roomNum = r.room_number;
      const roomAssignments = records.filter((a) => a.room_id === r.id);

      // A. Count currently active overbook excess occupants (e.g. 5 active in capacity 2 = 3 overbooked)
      const currentActive = roomAssignments.filter((a) => a.status === 'ACTIVE' && !a.check_out).length;
      const currentOverbookExcess = Math.max(0, currentActive - r.max_capacity);

      // B. Count total historical check-in occurrences where occupants exceeded capacity
      let historicalOverbookEvents = 0;
      
      // Group check-ins by timestamp/transaction to check peak occupancy during each stay
      const timeGroups = new Set();
      roomAssignments.forEach((a) => {
        const t = a.check_in || a.checked_in_at || a.created_at;
        if (t) timeGroups.add(t);
      });

      timeGroups.forEach((tStr) => {
        const checkTime = new Date(tStr).getTime();
        const concurrentAtTime = roomAssignments.filter((a) => {
          const inTime = new Date(a.check_in || a.checked_in_at || a.created_at).getTime();
          const outTime = a.check_out ? new Date(a.check_out).getTime() : Infinity;
          return inTime <= checkTime && outTime > checkTime;
        }).length;

        if (concurrentAtTime > r.max_capacity) {
          historicalOverbookEvents += (concurrentAtTime - r.max_capacity);
        }
      });

      // Take whichever overbook metric is higher (historical vs currently active)
      const totalOverbooked = Math.max(currentOverbookExcess, historicalOverbookEvents);

      return {
        room: `R-${roomNum}`,
        turnover: roomTurnover[roomNum] || 0,
        overbooked: totalOverbooked,
      };
    });

    return NextResponse.json({
      avgStayPerRoom,
      processedAssignments,
      availableYears,
      peakHours,
      roomTurnoverAndOverbook,
    });
  } catch (err) {
    console.error('Analytics API Error:', err);
    return NextResponse.json({ error: 'Failed to generate analytics.' }, { status: 500 });
  }
}
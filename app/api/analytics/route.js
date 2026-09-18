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

    // 1. AVERAGE STAY DURATION PER ROOM
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
      return {
        room: `R-${roomNum}`,
        avgHours: count > 0 ? parseFloat((totalHrs / count).toFixed(1)) : 0,
      };
    });

    // 2. TOP OCCUPANTS / FREQUENT GUESTS
    const occupantCounts = {};
    records.forEach((a) => {
      const name = a.guest_name || staffMap.get(a.staff_id) || (a.staff_id ? `Staff #${a.staff_id}` : 'Guest');
      occupantCounts[name] = (occupantCounts[name] || 0) + 1;
    });

    const topOccupants = Object.entries(occupantCounts)
      .map(([name, count]) => ({ name, checkIns: count }))
      .sort((a, b) => b.checkIns - a.checkIns)
      .slice(0, 5);

    // 3. PEAK CHECK-IN & CHECK-OUT HOURS OF THE DAY
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

    // 4. OVERBOOKING & TURNOVER FREQUENCY PER ROOM
    const roomTurnover = {};
    records.forEach((a) => {
      const roomObj = roomMap.get(a.room_id);
      const roomNum = roomObj ? roomObj.room_number : `${a.room_id}`;
      roomTurnover[roomNum] = (roomTurnover[roomNum] || 0) + 1;
    });

    const roomTurnoverAndOverbook = (rooms || []).map((r) => {
      const roomNum = r.room_number;
      const roomAssignments = records.filter((a) => a.room_id === r.id);

      let overbookEvents = 0;
      roomAssignments.forEach((a) => {
        const t = a.check_in || a.checked_in_at || a.created_at;
        if (t) {
          const concurrent = roomAssignments.filter((other) => {
            const otIn = other.check_in || other.checked_in_at || other.created_at;
            const otOut = other.check_out;
            return (
              otIn &&
              new Date(otIn) <= new Date(t) &&
              (!otOut || new Date(otOut) > new Date(t))
            );
          }).length;

          if (concurrent > r.max_capacity) {
            overbookEvents++;
          }
        }
      });

      return {
        room: `R-${roomNum}`,
        turnover: roomTurnover[roomNum] || 0,
        overbooked: overbookEvents,
      };
    });

    return NextResponse.json({
      avgStayPerRoom,
      topOccupants,
      peakHours,
      roomTurnoverAndOverbook,
    });
  } catch (err) {
    console.error('Analytics API Error:', err);
    return NextResponse.json({ error: 'Failed to generate analytics.' }, { status: 500 });
  }
}
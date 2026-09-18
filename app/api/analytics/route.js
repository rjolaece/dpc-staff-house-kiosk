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

    // Fetch assignments and room capacities
    const { data: assignments, error: aErr } = await supabase
      .from('room_assignments')
      .select('id, room_id, staff_id, guest_name, status, check_in, check_out');

    const { data: rooms, error: rErr } = await supabase
      .from('rooms')
      .select('id, room_number, max_capacity');

    if (aErr || rErr) {
      return NextResponse.json({ error: aErr?.message || rErr?.message }, { status: 500 });
    }

    const roomMap = new Map();
    rooms?.forEach((r) => roomMap.set(r.id, r));

    // 1. AVERAGE STAY DURATION PER ROOM (in hours)
    const roomStayTotals = {};
    const roomStayCounts = {};

    assignments.forEach((a) => {
      if (a.check_in && a.check_out) {
        const roomNum = roomMap.get(a.room_id)?.room_number || `Room ${a.room_id}`;
        const durationHours = (new Date(a.check_out) - new Date(a.check_in)) / (1000 * 60 * 60);

        if (durationHours > 0) {
          roomStayTotals[roomNum] = (roomStayTotals[roomNum] || 0) + durationHours;
          roomStayCounts[roomNum] = (roomStayCounts[roomNum] || 0) + 1;
        }
      }
    });

    const avgStayPerRoom = Object.keys(roomStayTotals).map((roomNum) => ({
      room: `R-${roomNum}`,
      avgHours: parseFloat((roomStayTotals[roomNum] / roomStayCounts[roomNum]).toFixed(1)),
    }));

    // 2. TOP OCCUPANTS / FREQUENT GUESTS
    const occupantCounts = {};
    assignments.forEach((a) => {
      const name = a.guest_name || `Staff ${a.staff_id}` || 'Guest';
      occupantCounts[name] = (occupantCounts[name] || 0) + 1;
    });

    const topOccupants = Object.entries(occupantCounts)
      .map(([name, count]) => ({ name, checkIns: count }))
      .sort((a, b) => b.checkIns - a.checkIns)
      .slice(0, 5);

    // 3. PEAK USAGE HOURS & DAYS
    const hourCounts = Array(24).fill(0);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayCounts = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 };

    assignments.forEach((a) => {
      if (a.check_in) {
        const date = new Date(a.check_in);
        hourCounts[date.getHours()] += 1;
        dayCounts[dayNames[date.getDay()]] += 1;
      }
    });

    const peakHours = hourCounts.map((count, hr) => ({
      hour: `${String(hr).padStart(2, '0')}:00`,
      checkIns: count,
    }));

    const peakDays = dayNames.map((day) => ({
      day,
      checkIns: dayCounts[day],
    }));

    // 4. OVERBOOKING & TURNOVER FREQUENCY PER ROOM
    const roomTurnover = {};
    const overbookingCounts = {};

    assignments.forEach((a) => {
      const roomNum = roomMap.get(a.room_id)?.room_number || `Room ${a.room_id}`;
      roomTurnover[roomNum] = (roomTurnover[roomNum] || 0) + 1;
    });

    // Detect overbooking frequency (check-ins occurring when room was at or above max capacity)
    rooms?.forEach((r) => {
      const roomNum = r.room_number;
      const roomAssignments = assignments.filter((a) => a.room_id === r.id);
      
      let overbookEvents = 0;
      roomAssignments.forEach((a) => {
        const concurrent = roomAssignments.filter(
          (other) =>
            new Date(other.check_in) <= new Date(a.check_in) &&
            (!other.check_out || new Date(other.check_out) > new Date(a.check_in))
        ).length;

        if (concurrent > r.max_capacity) {
          overbookEvents++;
        }
      });
      overbookingCounts[roomNum] = overbookEvents;
    });

    const roomTurnoverAndOverbook = (rooms || []).map((r) => ({
      room: `R-${r.room_number}`,
      turnover: roomTurnover[r.room_number] || 0,
      overbooked: overbookingCounts[r.room_number] || 0,
    }));

    return NextResponse.json({
      avgStayPerRoom,
      topOccupants,
      peakHours,
      peakDays,
      roomTurnoverAndOverbook,
    });
  } catch (err) {
    console.error('Analytics API Error:', err);
    return NextResponse.json({ error: 'Failed to generate analytics.' }, { status: 500 });
  }
}
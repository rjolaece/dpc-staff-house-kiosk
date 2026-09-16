import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET() {
  try {
    // 1. Get all rooms
    const { data: rooms, error: rErr } = await supabase
      .from('rooms')
      .select('*')
      .order('room_number', { ascending: true });

    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

    // 2. Get active assignments with staff names AND guest names
    const { data: activeAssignments, error: aErr } = await supabase
      .from('room_assignments')
      .select('*, staff(full_name)')
      .is('check_out', null);

    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });

    // 3. Format room occupant data
    const formattedRooms = rooms.map((room) => {
      const maxCapacity = room.room_number === '201' ? 4 : 2;
      const occupants = activeAssignments.filter((a) => a.room_id === room.id);
      const count = occupants.length;

      let status = 'AVAILABLE';
      if (count >= maxCapacity) {
        status = 'FULL';
      } else if (count > 0) {
        status = 'PARTIAL';
      }

      return {
        ...room,
        max_capacity: maxCapacity,
        occupant_count: count,
        status: status,
        occupants: occupants.map((o) => ({
          assignment_id: o.id,
          // Prioritize staff name, fall back to guest_name, then 'Guest'
          staff_name: o.staff?.full_name || o.guest_name || 'Guest',
          checked_in_at: o.check_in,
          fob_uid: o.fob_uid,
        })),
      };
    });

    return NextResponse.json(formattedRooms);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET() {
  try {
    const { data: rooms, error: roomsErr } = await supabase
      .from('rooms')
      .select('*')
      .order('room_number', { ascending: true });

    if (roomsErr) {
      return NextResponse.json({ error: roomsErr.message }, { status: 500 });
    }

    const { data: activeLogs } = await supabase
      .from('room_assignments')
      .select('room_id, check_in, staff ( full_name )')
      .is('check_out', null);

    const formattedRooms = (rooms || []).map((room) => {
      const activeLog = activeLogs?.find((log) => String(log.room_id) === String(room.id));

      return {
        id: room.id,
        room_number: room.room_number,
        status: room.status,
        occupant_name: activeLog?.staff?.full_name || null,
        checked_in_at: activeLog?.check_in || null,
      };
    });

    return NextResponse.json(formattedRooms);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
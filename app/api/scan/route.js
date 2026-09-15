import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(request) {
  try {
    const { key_fob_uid, staff_id, room_id } = await request.json();

    if (!key_fob_uid) {
      return NextResponse.json({ error: 'Key fob UID is required.' }, { status: 400 });
    }

    // 1. Check for an active check-in (where check_out is null)
    const { data: activeLog } = await supabase
      .from('room_assignments')
      .select('*')
      .eq('fob_uid', key_fob_uid)
      .is('check_out', null)
      .maybeSingle();

    if (activeLog) {
      // Perform Check-Out
      await supabase
        .from('room_assignments')
        .update({ check_out: new Date().toISOString() })
        .eq('id', activeLog.id);

      await supabase
        .from('rooms')
        .update({ status: 'AVAILABLE' })
        .eq('id', activeLog.room_id);

      return NextResponse.json({ message: 'Check-out successful!', action: 'CHECK_OUT' });
    }

    // 2. Perform Check-In
    if (!staff_id || !room_id) {
      return NextResponse.json(
        { error: 'Staff member and Room selection are required for check-in.' },
        { status: 400 }
      );
    }

    const { error: insertErr } = await supabase.from('room_assignments').insert([
      {
        staff_id,
        room_id,
        fob_uid: key_fob_uid,
        check_in: new Date().toISOString(),
      },
    ]);

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    await supabase
      .from('rooms')
      .update({ status: 'OCCUPIED' })
      .eq('id', room_id);

    return NextResponse.json({ message: 'Check-in successful!', action: 'CHECK_IN' });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
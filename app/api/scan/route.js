import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req) {
  try {
    const { key_fob_uid, staff_id, room_id } = await req.json();

    if (!key_fob_uid) {
      return NextResponse.json({ error: 'Key fob UID is required.' }, { status: 400 });
    }

    // 1. CHECK-OUT: Check if this fob is currently assigned to an active stay
    const { data: existingAssignment } = await supabase
      .from('room_assignments')
      .select('*, rooms(room_number), staff(full_name)')
      .eq('fob_uid', key_fob_uid)
      .is('check_out', null)
      .maybeSingle();

    if (existingAssignment) {
      // Perform Check-Out
      await supabase
        .from('room_assignments')
        .update({ check_out: new Date().toISOString() })
        .eq('id', existingAssignment.id);

      return NextResponse.json({
        action: 'CHECK_OUT',
        message: `✅ ${existingAssignment.staff?.full_name || 'Staff'} checked out of Room ${existingAssignment.rooms?.room_number}!`,
      });
    }

    // 2. CHECK-IN: Require staff_id and room_id
    if (!staff_id || !room_id) {
      return NextResponse.json(
        { error: 'Key fob is not checked in. Select staff & room first.' },
        { status: 400 }
      );
    }

    // Fetch room capacity details
    const { data: roomData } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', room_id)
      .single();

    const maxCapacity = roomData?.room_number === '201' ? 4 : 2;

    // Count current active occupants in this room
    const { count } = await supabase
      .from('room_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', room_id)
      .is('check_out', null);

    if (count >= maxCapacity) {
      return NextResponse.json(
        { error: `Room ${roomData?.room_number} is full (${maxCapacity}/${maxCapacity} occupants).` },
        { status: 400 }
      );
    }

    // Record new check-in
    await supabase.from('room_assignments').insert([
      {
        staff_id,
        room_id,
        fob_uid: key_fob_uid,
        check_in: new Date().toISOString(),
      },
    ]);

    return NextResponse.json({
      action: 'CHECK_IN',
      message: `✅ Check-in successful for Room ${roomData?.room_number}!`,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
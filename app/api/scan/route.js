import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req) {
  try {
    const { key_fob_uid, staff_id, room_id } = await req.json();

    if (!key_fob_uid) {
      return NextResponse.json({ error: 'Key fob UID is required.' }, { status: 400 });
    }

    // -------------------------------------------------------------
    // 1. CHECK-IN FLOW (Triggered when Staff & Room are selected)
    // -------------------------------------------------------------
    if (staff_id && room_id) {
      // Fetch room details to check capacity
      const { data: roomData, error: rErr } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', room_id)
        .single();

      if (rErr || !roomData) {
        return NextResponse.json({ error: 'Room not found.' }, { status: 404 });
      }

      const maxCapacity = roomData.room_number === '201' ? 4 : 2;

      // Count current active occupants in this specific room
      const { count, error: cErr } = await supabase
        .from('room_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', room_id)
        .is('check_out', null);

      if (cErr) {
        return NextResponse.json({ error: 'Error checking room capacity.' }, { status: 500 });
      }

      if (count >= maxCapacity) {
        return NextResponse.json(
          { error: `Room ${roomData.room_number} is already full (${maxCapacity}/${maxCapacity} occupants).` },
          { status: 400 }
        );
      }

      // Ensure this specific staff member is not already checked into an active room
      const { data: activeStaff } = await supabase
        .from('room_assignments')
        .select('id')
        .eq('staff_id', staff_id)
        .is('check_out', null)
        .maybeSingle();

      if (activeStaff) {
        return NextResponse.json(
          { error: 'This staff member is already checked into a room.' },
          { status: 400 }
        );
      }

      // Record NEW check-in (without disturbing existing room occupants)
      const { error: insertErr } = await supabase
        .from('room_assignments')
        .insert([
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

      return NextResponse.json({
        action: 'CHECK_IN',
        message: `✅ Check-in successful for Room ${roomData.room_number}!`,
      });
    }

    // -------------------------------------------------------------
    // 2. CHECK-OUT FLOW (Triggered when tapping a fob directly)
    // -------------------------------------------------------------
    const { data: existingAssignment, error: findErr } = await supabase
      .from('room_assignments')
      .select('*, rooms(room_number), staff(full_name)')
      .eq('fob_uid', key_fob_uid)
      .is('check_out', null)
      .maybeSingle();

    if (existingAssignment) {
      // Perform Check-Out for ONLY this specific assignment/fob
      const { error: outErr } = await supabase
        .from('room_assignments')
        .update({ check_out: new Date().toISOString() })
        .eq('id', existingAssignment.id);

      if (outErr) {
        return NextResponse.json({ error: outErr.message }, { status: 500 });
      }

      return NextResponse.json({
        action: 'CHECK_OUT',
        message: `✅ ${existingAssignment.staff?.full_name || 'Staff'} checked out of Room ${existingAssignment.rooms?.room_number}!`,
      });
    }

    return NextResponse.json(
      { error: 'Key fob is not assigned to any active room check-in.' },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
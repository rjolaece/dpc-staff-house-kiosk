import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(req) {
  try {
    const { key_fob_uid, persons, room_id, staff_id, guest_name } = await req.json();

    // Check if room_id is provided
    if (!room_id) {
      return NextResponse.json({ error: 'Room selection is required.' }, { status: 400 });
    }

    // Support both multi-person array AND single-person fallback
    const personList = Array.isArray(persons) && persons.length > 0
      ? persons
      : [{ staff_id: staff_id || null, guest_name: guest_name || null }];

    // Prepare bulk insert payload for Supabase
    const insertPayload = personList.map((p) => ({
      room_id: room_id,
      staff_id: p.staff_id || null,
      guest_name: p.guest_name || null,
      key_fob_uid: key_fob_uid || 'SYSTEM_AUTO',
      checked_in_at: new Date().toISOString(),
    }));

    // Perform bulk insertion into room_assignments
    const { data, error } = await supabase
      .from('room_assignments')
      .insert(insertPayload)
      .select();

    if (error) {
      console.error('Supabase Bulk Insert Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const count = personList.length;
    return NextResponse.json({
      message: `Successfully checked in ${count} person${count > 1 ? 's' : ''}!`,
      assignments: data,
    });
  } catch (err) {
    console.error('Scan API Handler Error:', err);
    return NextResponse.json({ error: 'Failed to process check-in request.' }, { status: 500 });
  }
}
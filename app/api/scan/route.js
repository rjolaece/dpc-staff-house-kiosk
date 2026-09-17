import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(req) {
  try {
    const { key_fob_uid, persons, room_id, staff_id, guest_name } = await req.json();

    // Support single person fallback as well as persons array
    const personList = Array.isArray(persons) && persons.length > 0 
      ? persons 
      : [{ staff_id, guest_name }];

    if (!room_id) {
      return NextResponse.json({ error: 'Room selection required.' }, { status: 400 });
    }

    // Bulk insert assignments
    const insertPayload = personList.map((p) => ({
      room_id,
      staff_id: p.staff_id || null,
      guest_name: p.guest_name || null,
      key_fob_uid: key_fob_uid || 'SYSTEM_AUTO',
      checked_in_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from('room_assignments').insert(insertPayload);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      message: `Successfully checked in ${personList.length} person(s)!`,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to process check-in.' }, { status: 500 });
  }
}
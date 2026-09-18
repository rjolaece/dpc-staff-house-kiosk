import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Prevent static evaluation at build time
export const dynamic = 'force-dynamic';

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const key = 
    process.env.SUPABASE_SERVICE_ROLE_KEY || 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
    'placeholder-key';
    
  return createClient(url, key);
}

export async function POST(req) {
  try {
    const supabase = getSupabaseClient();
    const { key_fob_uid, persons, room_id, staff_id, guest_name } = await req.json();

    if (!room_id) {
      return NextResponse.json({ error: 'Room selection is required.' }, { status: 400 });
    }

    // Support multi-person array or single-person fallback
    const personList = Array.isArray(persons) && persons.length > 0
      ? persons
      : [{ staff_id: staff_id || null, guest_name: guest_name || null }];

    // Prepare bulk insert payload
    const insertPayload = personList.map((p) => ({
      room_id: room_id,
      staff_id: p.staff_id || null,
      guest_name: p.guest_name || null,
      key_fob_uid: key_fob_uid || 'SYSTEM_AUTO',
      checked_in_at: new Date().toISOString(),
    }));

    // Perform bulk insertion
    const { data, error } = await supabase
      .from('room_assignments')
      .insert(insertPayload)
      .select();

    if (error) {
      console.error('Supabase Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const count = personList.length;
    return NextResponse.json({
      message: `Successfully checked in ${count} person${count > 1 ? 's' : ''}!`,
      assignments: data,
    });
  } catch (err) {
    console.error('Scan API Error:', err);
    return NextResponse.json({ error: 'Failed to process check-in.' }, { status: 500 });
  }
}
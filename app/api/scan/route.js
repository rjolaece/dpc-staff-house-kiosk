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

export async function POST(req) {
  try {
    const supabase = getSupabaseClient();
    const { key_fob_uid, persons, room_id, staff_id, guest_name } = await req.json();

    if (!room_id) {
      return NextResponse.json({ error: 'Room selection is required.' }, { status: 400 });
    }

    const personList = Array.isArray(persons) && persons.length > 0
      ? persons
      : [{ staff_id: staff_id || null, guest_name: guest_name || null }];

    // 1. Fetch all current active room assignments
    const { data: activeAssignments, error: activeErr } = await supabase
      .from('room_assignments')
      .select('staff_id, guest_name')
      .eq('status', 'ACTIVE')
      .is('check_out', null);

    if (activeErr) {
      console.error('Failed to fetch active assignments:', activeErr);
    } else if (activeAssignments) {
      // 2. Filter out persons who are already checked in
      const alreadyCheckedIn = [];

      personList.forEach((p) => {
        const isAlreadyIn = activeAssignments.some((active) => {
          if (p.staff_id && active.staff_id === p.staff_id) return true;
          if (p.guest_name && active.guest_name?.toLowerCase() === p.guest_name.toLowerCase()) return true;
          return false;
        });

        if (isAlreadyIn) {
          alreadyCheckedIn.push(p.guest_name || 'Selected Staff');
        }
      });

      if (alreadyCheckedIn.length > 0) {
        return NextResponse.json(
          { error: `Cannot check in: ${alreadyCheckedIn.join(', ')} is already checked into a room.` },
          { status: 400 }
        );
      }
    }

    // 3. Map insert payload if all selected persons are eligible
    const insertPayload = personList.map((p) => ({
      room_id: room_id,
      staff_id: p.staff_id || null,
      guest_name: p.guest_name || null,
      fob_uid: key_fob_uid || 'SYSTEM_AUTO',
      status: 'ACTIVE',
      check_in: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from('room_assignments')
      .insert(insertPayload)
      .select();

    if (error) {
      console.error('Supabase Insert Error:', error);
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
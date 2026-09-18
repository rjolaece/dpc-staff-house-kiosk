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
    const { key_fob_uid, assignment_ids, persons, room_id, staff_id, guest_name } = await req.json();

    // ----------------------------------------------------
    // BRANCH 1: CHECK-OUT VIA EXPLICIT ASSIGNMENT IDS
    // ----------------------------------------------------
    if (Array.isArray(assignment_ids) && assignment_ids.length > 0) {
      const { data, error } = await supabase
        .from('room_assignments')
        .update({
          status: 'COMPLETED',
          check_out: new Date().toISOString(),
        })
        .in('id', assignment_ids)
        .select();

      if (error) {
        console.error('Checkout Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        message: 'Successfully checked out occupant(s)!',
        assignments: data,
      });
    }

    // ----------------------------------------------------
    // BRANCH 2: CHECK-IN (WHEN ROOM_ID IS PASSED)
    // ----------------------------------------------------
    if (room_id) {
      const personList = Array.isArray(persons) && persons.length > 0
        ? persons
        : [{ staff_id: staff_id || null, guest_name: guest_name || null }];

      // --- DUPLICATE CHECK-IN RESTRICTION ---
      const { data: activeAssignments, error: activeErr } = await supabase
        .from('room_assignments')
        .select('staff_id, guest_name')
        .eq('status', 'ACTIVE')
        .is('check_out', null);

      if (activeErr) {
        console.error('Active occupants lookup failed:', activeErr);
      } else if (activeAssignments && activeAssignments.length > 0) {
        const alreadyCheckedIn = [];

        personList.forEach((p) => {
          const isAlreadyActive = activeAssignments.some((active) => {
            if (p.staff_id && active.staff_id === p.staff_id) return true;
            if (p.guest_name && active.guest_name && active.guest_name.toLowerCase() === p.guest_name.toLowerCase()) return true;
            return false;
          });

          if (isAlreadyActive) {
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

      // Generate a unique fob UID per transaction if none provided
      const uniqueFob = key_fob_uid || `FOB_R${room_id}_${Date.now()}`;

      const insertPayload = personList.map((p) => ({
        room_id: room_id,
        staff_id: p.staff_id || null,
        guest_name: p.guest_name || null,
        fob_uid: uniqueFob,
        status: 'ACTIVE',
        check_in: new Date().toISOString(),
      }));

      const { data, error } = await supabase
        .from('room_assignments')
        .insert(insertPayload)
        .select();

      if (error) {
        console.error('Checkin Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const count = personList.length;
      return NextResponse.json({
        message: `Successfully checked in ${count} person${count > 1 ? 's' : ''}!`,
        assignments: data,
      });
    }

    // ----------------------------------------------------
    // BRANCH 3: CHECK-OUT VIA FOB SCAN (SCANNING EXISTING FOB)
    // ----------------------------------------------------
    if (key_fob_uid) {
      const { data: activeAssignments } = await supabase
        .from('room_assignments')
        .select('id')
        .eq('fob_uid', key_fob_uid)
        .eq('status', 'ACTIVE')
        .is('check_out', null);

      if (activeAssignments && activeAssignments.length > 0) {
        const activeIds = activeAssignments.map((a) => a.id);
        const { data, error } = await supabase
          .from('room_assignments')
          .update({
            status: 'COMPLETED',
            check_out: new Date().toISOString(),
          })
          .in('id', activeIds)
          .select();

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
          message: 'Successfully checked out active occupant(s)!',
          assignments: data,
        });
      }
    }

    return NextResponse.json({ error: 'Room selection is required for check-in.' }, { status: 400 });
  } catch (err) {
    console.error('Scan API Error:', err);
    return NextResponse.json({ error: 'Failed to process request.' }, { status: 500 });
  }
}
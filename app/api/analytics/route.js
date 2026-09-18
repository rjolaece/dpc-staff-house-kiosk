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

export async function GET() {
  try {
    const supabase = getSupabaseClient();

    const { data: assignments, error: aErr } = await supabase
      .from('room_assignments')
      .select('*');

    const { data: rooms, error: rErr } = await supabase
      .from('rooms')
      .select('*');

    const { data: staffList } = await supabase
      .from('staff')
      .select('id, full_name');

    if (aErr || rErr) {
      console.error('Analytics Fetch Error:', aErr || rErr);
      return NextResponse.json({ error: aErr?.message || rErr?.message }, { status: 500 });
    }

    const roomMap = new Map();
    (rooms || []).forEach((r) => roomMap.set(String(r.id), r));

    const staffMap = new Map();
    (staffList || []).forEach((s) => staffMap.set(String(s.id), s.full_name));

    const records = assignments || [];

    const rawAssignments = records.map((a) => {
      const checkInTime = a.check_in || a.checked_in_at || a.created_at;
      const dateObj = checkInTime ? new Date(checkInTime) : null;
      const roomObj = roomMap.get(String(a.room_id));

      return {
        ...a,
        room_number: roomObj ? roomObj.room_number : (a.room_number || a.room_id),
        name: a.guest_name || staffMap.get(String(a.staff_id)) || (a.staff_id ? `Staff #${a.staff_id}` : 'Guest'),
        year: dateObj && !isNaN(dateObj.getTime()) ? dateObj.getFullYear() : null,
        month: dateObj && !isNaN(dateObj.getTime()) ? dateObj.getMonth() + 1 : null,
      };
    });

    const availableYears = Array.from(
      new Set(rawAssignments.map((a) => a.year).filter(Boolean))
    ).sort((a, b) => b - a);

    return NextResponse.json({
      rooms: rooms || [],
      rawAssignments,
      availableYears: availableYears.length > 0 ? availableYears : [new Date().getFullYear()],
    });
  } catch (err) {
    console.error('Analytics API Uncaught Error:', err);
    return NextResponse.json({ error: 'Failed to generate analytics.' }, { status: 500 });
  }
}
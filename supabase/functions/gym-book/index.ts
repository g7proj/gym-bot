import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decryptString } from '../_shared/crypto.ts';
import { addWait, bookLesson, gymLogin } from '../_shared/gymClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Book a class or place the user in the waitlist depending on availability.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const authHeader = req.headers.get('authorization') || '';

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // The request must be authenticated with Supabase auth.
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load encrypted gym credentials from the users table.
    const { data: userRow, error: userRowError } = await supabase
      .from('users')
      .select('username, password_encrypted')
      .eq('id', user.id)
      .single();

    if (userRowError || !userRow?.password_encrypted) {
      return new Response(JSON.stringify({ error: 'User credentials not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const idService = Number(body?.idService);
    const idLesson = Number(body?.idLesson);
    const date = String(body?.date || '').trim();
    const startTimeRaw = String(body?.startTime || '').trim();
    const endTimeRaw = String(body?.endTime || '').trim();
    // Accept either full ISO timestamps or date + time fragments.
    const startTime =
      startTimeRaw.includes('T')
        ? startTimeRaw
        : (date ? `${date}T${startTimeRaw}:00` : startTimeRaw);

    const endTime =
      endTimeRaw.includes('T')
        ? endTimeRaw
        : (date ? `${date}T${endTimeRaw}:00` : endTimeRaw);
    const type = Number.isFinite(body?.type) ? Number(body.type) : 0;
    const idDurata = Number.isFinite(body?.idDurata) ? Number(body.idDurata) : 0;
    const bookNr = Number.isFinite(body?.bookNr) ? Number(body.bookNr) : 0;
    const availablePlaces = Number(body?.availablePlaces ?? 0);
    const waitingListPosition = Number(body?.waitingListPosition ?? 0);
    const isUserPresent = Boolean(body?.isUserPresent);

    if (!idService || !idLesson || !startTime || !endTime) {
      return new Response(JSON.stringify({ error: 'Missing booking fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Avoid duplicate bookings or waitlist entries from the UI.
    if (isUserPresent || waitingListPosition > 0) {
      return new Response(JSON.stringify({ error: 'Already booked or in waiting list' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const password = await decryptString(userRow.password_encrypted);
    const token = await gymLogin(userRow.username, password);

    const payload = {
      Note: '',
      BookNr: bookNr,
      BookingID: idService,
      StartTime: startTime,
      EndTime: endTime,
      IDLesson: idLesson,
      Type: type,
      IDDurata: idDurata,
    };

    // If no slots are available, fall back to waitlist.
    const response = availablePlaces > 0
      ? await bookLesson(token, payload)
      : await addWait(token, payload);

    return new Response(JSON.stringify({ success: true, response }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message || 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

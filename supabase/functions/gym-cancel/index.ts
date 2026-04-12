import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decryptString } from '../_shared/crypto.ts';
import { requireAuth } from '../_shared/auth.ts';
import { cancelBooking, gymLogin, removeWait } from '../_shared/gymClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Cancel a booking or remove the user from the waitlist.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const authHeader = req.headers.get('authorization') || '';

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const authResult = await requireAuth(req, supabaseUrl, supabaseServiceRoleKey, corsHeaders);
    if (authResult.errorResponse) {
      return authResult.errorResponse;
    }
    const user = authResult.user;

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
    const bookingId = Number(body?.bookingId);
    const idLesson = Number(body?.idLesson ?? 0);
    const date = String(body?.date || '').trim();
    const startTimeRaw = String(body?.startTime || '').trim();
    const endTimeRaw = String(body?.endTime || '').trim();
    // Support both ISO timestamps and date + time fragments from the UI.
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
    const isUserPresent = Boolean(body?.isUserPresent);

    if (!bookingId || !startTime || !endTime) {
      return new Response(JSON.stringify({ error: 'Missing cancel fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const password = await decryptString(userRow.password_encrypted);
    const gymToken = await gymLogin(userRow.username, password);

    const payload = {
      BookingID: bookingId,
      IDLesson: idLesson,
      Type: type,
      StartTime: startTime,
      EndTime: endTime,
      IDDurata: idDurata,
    };

    // If the user isn't confirmed, canceling means removing from the waitlist.
    const response = isUserPresent
      ? await cancelBooking(gymToken, payload)
      : await removeWait(gymToken, payload);

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

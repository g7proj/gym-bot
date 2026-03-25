import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decryptString } from '../_shared/crypto.ts';
import { gymLogin, myBookings } from '../_shared/gymClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const password = await decryptString(userRow.password_encrypted);
    const token = await gymLogin(userRow.username, password);

    const response = await myBookings(token);
    const items = Array.isArray(response?.Items) ? response.Items : [];

    const normalized = items
      .filter((item) => String(item?.CategoryDescription || '').trim() === 'CORSI FIT')
      .map((item) => ({
        bookingId: item?.BookingID ?? null,
        idLesson: item?.IDLesson ?? null,
        type: item?.Type ?? 0,
        idDurata: item?.IDDurata ?? 0,
        startTime: String(item?.StartTime || ''),
        endTime: String(item?.EndTime || ''),
        isUserPresent: Number(item?.IsUserPresent ?? 0) === 1,
        waitingListPosition: Number(item?.UserPositionWaitingList ?? 0),
        service: String(item?.ServiceDescription || '').trim(),
        category: String(item?.CategoryDescription || '').trim(),
        additionalInfo: String(item?.AdditionalInfo || '').trim(),
      }));

    return new Response(JSON.stringify({ items: normalized }), {
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

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decryptString } from '../_shared/crypto.ts';
import { gymLogin, listWithMine } from '../_shared/gymClient.ts';
import { formatLocalIsoSeconds, getDailyTimeWindow, getRollingWeekWindow } from '../_shared/schedule.ts';

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

    const timeZone = Deno.env.get('APP_TIMEZONE') || 'Europe/Rome';
    const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone }));
    const startDate = new Date(nowInTz);
    startDate.setHours(0, 0, 0, 0);
    const rolling = getRollingWeekWindow(20, startDate, timeZone);
    const daily = getDailyTimeWindow(rolling.start, timeZone);

    const response = await listWithMine(
      token,
      formatLocalIsoSeconds(rolling.start),
      formatLocalIsoSeconds(rolling.end),
      formatLocalIsoSeconds(daily.start),
      formatLocalIsoSeconds(daily.end),
    );

    const items = Array.isArray(response?.Items) ? response.Items : [];
    const byDate: Record<string, any[]> = {};

    items.forEach((item: any) => {
      const dateLessonStr = String(item?.DateLesson || '').trim();
      const serviceDesc = String(item?.ServiceDescription || '').trim();
      if (!dateLessonStr || !serviceDesc) return;

      const dateKey = dateLessonStr.slice(0, 10);
      const startTime = String(item?.StartTime || '').slice(11, 16);
      const endTime = String(item?.EndTime || '').slice(11, 16);

      const entry = {
        idLesson: item?.IDLesson,
        idService: item?.IDServizio,
        date: dateKey,
        startTime,
        endTime,
        service: serviceDesc,
        category: String(item?.CategoryDescription || '').trim(),
        availablePlaces: Number(item?.AvailablePlaces ?? 0),
        isUserPresent: Number(item?.IsUserPresent ?? 0) === 1,
        waitingListPosition: Number(item?.UserPositionWaitingList ?? 0),
        maxBookings: Number(item?.MaxPrenotazioni ?? 0),
        webMaxUser: Number(item?.WebMaxPostiUtente ?? 0),
        isLocked: Number(item?.IsLocked ?? 0),
      };

      if (!byDate[dateKey]) {
        byDate[dateKey] = [];
      }
      byDate[dateKey].push(entry);
    });

    const days = Object.keys(byDate)
      .sort()
      .map((date) => ({
        date,
        items: byDate[date].sort((a, b) => String(a.startTime).localeCompare(String(b.startTime))),
      }));

    return new Response(JSON.stringify({
      start_date: formatLocalIsoSeconds(rolling.start).slice(0, 10),
      end_date: formatLocalIsoSeconds(rolling.end).slice(0, 10),
      days,
    }), {
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

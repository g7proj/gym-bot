import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decryptString } from '../_shared/crypto.ts';
import { requireAuth } from '../_shared/auth.ts';
import { gymLogin, listWithMine } from '../_shared/gymClient.ts';
import { formatLocalIsoSeconds, getDailyTimeWindow } from '../_shared/schedule.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Build a date range: current month + next month for calendar view.
function getMonthRange(timeZone: string): { start: Date; end: Date; currentEnd: Date } {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone }));
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 0);
  return { start, end, currentEnd };
}

// Return a calendar-like list of bookable classes grouped by date.
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

    const password = await decryptString(userRow.password_encrypted);
    const gymToken = await gymLogin(userRow.username, password);

    const timeZone = Deno.env.get('APP_TIMEZONE') || 'Europe/Rome';
    const range = getMonthRange(timeZone);
    const daily = getDailyTimeWindow(range.start, timeZone);

    const response = await listWithMine(
      gymToken,
      formatLocalIsoSeconds(range.start),
      formatLocalIsoSeconds(range.end),
      formatLocalIsoSeconds(daily.start),
      formatLocalIsoSeconds(daily.end),
    );

    const items = Array.isArray(response?.Items) ? response.Items : [];
    const byDate: Record<string, any[]> = {};
    let maxDate = '';

    items.forEach((item: any) => {
      const category = String(item?.CategoryDescription || '').trim();
      // Only return fitness classes, not other booking categories.
      if (category !== 'CORSI FIT') return;
      const dateLessonStr = String(item?.DateLesson || '').trim();
      const serviceDesc = String(item?.ServiceDescription || '').trim();
      if (!dateLessonStr || !serviceDesc) return;

      const dateKey = dateLessonStr.slice(0, 10);
      if (!maxDate || dateKey > maxDate) {
        maxDate = dateKey;
      }
      const startTime = String(item?.StartTime || '').slice(11, 16);
      const endTime = String(item?.EndTime || '').slice(11, 16);

      const entry = {
        idLesson: item?.IDLesson,
        idService: item?.IDServizio,
        date: dateKey,
        startTime,
        endTime,
        service: serviceDesc,
        category,
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

    // Extend end_date if the API returns dates beyond the current month.
    let endDate = formatLocalIsoSeconds(range.currentEnd).slice(0, 10);
    if (maxDate) {
      const currentEndStr = formatLocalIsoSeconds(range.currentEnd).slice(0, 10);
      endDate = maxDate > currentEndStr ? maxDate : currentEndStr;
    }

    return new Response(JSON.stringify({
      start_date: formatLocalIsoSeconds(range.start).slice(0, 10),
      end_date: endDate,
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

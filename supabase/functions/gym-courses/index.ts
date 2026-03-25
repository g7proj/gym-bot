import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decryptString } from '../_shared/crypto.ts';
import { gymLogin, listWithMine } from '../_shared/gymClient.ts';
import {
  formatLocalIsoSeconds,
  getDailyTimeWindow,
  getRollingWeekWindow,
  parseApiDate,
  weekdayName,
} from '../_shared/schedule.ts';

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
    const tomorrow = new Date(nowInTz);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const rolling = getRollingWeekWindow(7, tomorrow, timeZone);
    const daily = getDailyTimeWindow(rolling.start, timeZone);

    const response = await listWithMine(
      token,
      formatLocalIsoSeconds(rolling.start),
      formatLocalIsoSeconds(rolling.end),
      formatLocalIsoSeconds(daily.start),
      formatLocalIsoSeconds(daily.end),
    );

    const items = Array.isArray(response?.Items) ? response.Items : [];
    const byDay: Record<string, string[]> = {};

    items.forEach((item: any) => {
      const category = String(item?.CategoryDescription || '').trim();
      if (category !== 'CORSI FIT') return;
      const dateLessonStr = item?.DateLesson;
      const serviceDesc = String(item?.ServiceDescription || '').trim();
      if (!dateLessonStr || !serviceDesc) return;

      const parsedDate = parseApiDate(dateLessonStr);
      if (!parsedDate) return;

      const dayName = weekdayName(parsedDate);
      if (!dayName) return;

      const normalized = serviceDesc.toLowerCase();
      byDay[dayName] = byDay[dayName] || [];
      if (!byDay[dayName].includes(normalized)) {
        byDay[dayName].push(normalized);
      }
    });

    Object.keys(byDay).forEach((day) => {
      byDay[day] = byDay[day].sort();
    });

    return new Response(JSON.stringify({ by_day: byDay }), {
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

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decryptString } from '../_shared/crypto.ts';
import { requireAuth } from '../_shared/auth.ts';
import { gymLogin, listWithMine } from '../_shared/gymClient.ts';
import {
  formatApiTime,
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

type LessonSlot = {
  weekday: string;
  course: string;
  course_label: string;
  date: string;
  lesson_start_time: string;
  lesson_end_time: string;
  id_service: number;
  id_lesson: number;
  available_places: number;
};

// Return distinct lesson slots grouped by weekday for the next rolling week.
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
    // Start from tomorrow so users don't see already-started classes.
    const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone }));
    const tomorrow = new Date(nowInTz);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const rolling = getRollingWeekWindow(7, tomorrow, timeZone);
    const daily = getDailyTimeWindow(rolling.start, timeZone);

    const response = await listWithMine(
      gymToken,
      formatLocalIsoSeconds(rolling.start),
      formatLocalIsoSeconds(rolling.end),
      formatLocalIsoSeconds(daily.start),
      formatLocalIsoSeconds(daily.end),
    );

    const items = Array.isArray(response?.Items) ? response.Items : [];
    const byDay: Record<string, LessonSlot[]> = {};
    const seen = new Set<string>();

    items.forEach((item: any) => {
      const category = String(item?.CategoryDescription || '').trim();
      if (category !== 'CORSI FIT') return;

      const dateLessonStr = String(item?.DateLesson || '').trim();
      const serviceDesc = String(item?.ServiceDescription || '').trim();
      const startTime = formatApiTime(item?.StartTime);
      const endTime = formatApiTime(item?.EndTime);
      if (!dateLessonStr || !serviceDesc || !startTime || !endTime) return;

      const parsedDate = parseApiDate(dateLessonStr);
      if (!parsedDate) return;

      const dayName = weekdayName(parsedDate);
      if (!dayName) return;

      const normalizedCourse = serviceDesc.toLowerCase();
      const slotKey = `${dayName}|${normalizedCourse}|${startTime}`;
      if (seen.has(slotKey)) return;
      seen.add(slotKey);

      byDay[dayName] = byDay[dayName] || [];
      byDay[dayName].push({
        weekday: dayName,
        course: normalizedCourse,
        course_label: serviceDesc,
        date: dateLessonStr.slice(0, 10),
        lesson_start_time: startTime,
        lesson_end_time: endTime,
        id_service: Number(item?.IDServizio ?? 0),
        id_lesson: Number(item?.IDLesson ?? 0),
        available_places: Number(item?.AvailablePlaces ?? 0),
      });
    });

    Object.keys(byDay).forEach((day) => {
      byDay[day] = byDay[day].sort((left, right) => {
        if (left.lesson_start_time === right.lesson_start_time) {
          return left.course_label.localeCompare(right.course_label);
        }
        return left.lesson_start_time.localeCompare(right.lesson_start_time);
      });
    });

    return new Response(JSON.stringify({ by_day: byDay }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

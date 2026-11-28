import { createSupabaseAdmin, requireAuth } from '../_shared/auth.ts';
import { listWithMine } from '../_shared/gymClient.ts';
import { UserCredentialsNotFoundError, withGymSession } from '../_shared/gymSession.ts';
import { getCorsHeaders, handleOptions, jsonResponse } from '../_shared/http.ts';
import {
  formatApiTime,
  getUpcomingRollingWindowStrings,
  weekdayFromIsoDate,
} from '../_shared/schedule.ts';

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
Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return handleOptions(corsHeaders);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    const authResult = await requireAuth(req, supabaseUrl, supabaseServiceRoleKey, corsHeaders);
    if (authResult.errorResponse || !authResult.user) {
      return authResult.errorResponse!;
    }
    const user = authResult.user;

    const supabaseAdmin = createSupabaseAdmin(supabaseUrl, supabaseServiceRoleKey);

    const timeZone = Deno.env.get('APP_TIMEZONE') || 'Europe/Rome';
    // Fetch a 14-day rolling window starting tomorrow so single-day holidays never hide a weekday's slots.
    const windowStrings = getUpcomingRollingWindowStrings(14, timeZone);

    const response = await withGymSession(
      supabaseAdmin,
      user.id,
      (gymToken) =>
        listWithMine(
          gymToken,
          windowStrings.startIso,
          windowStrings.endIso,
          windowStrings.timeStartIso,
          windowStrings.timeEndIso,
        ),
      { idempotent: true },
    );

    const items = Array.isArray(response?.Items)
      ? (response.Items as Record<string, unknown>[])
      : [];
    const byDay: Record<string, LessonSlot[]> = {};
    const seen = new Set<string>();

    items.forEach((item) => {
      const category = String(item?.CategoryDescription || '').trim();
      if (category !== 'CORSI FIT') return;

      const dateLessonStr = String(item?.DateLesson || '').trim();
      const serviceDesc = String(item?.ServiceDescription || '').trim();
      const startTime = formatApiTime(String(item?.StartTime || ''));
      const endTime = formatApiTime(String(item?.EndTime || ''));
      if (!dateLessonStr || !serviceDesc || !startTime || !endTime) return;

      const dateKey = dateLessonStr.slice(0, 10);
      const dayName = weekdayFromIsoDate(dateKey);
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
        date: dateKey,
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

    return jsonResponse({ by_day: byDay }, 200, corsHeaders);
  } catch (err: unknown) {
    if (err instanceof UserCredentialsNotFoundError) {
      return jsonResponse({ error: 'User credentials not found' }, 404, corsHeaders);
    }
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});

import { createSupabaseAdmin, requireAuth } from '../_shared/auth.ts';
import { listWithMine } from '../_shared/gymClient.ts';
import { UserCredentialsNotFoundError, withGymSession } from '../_shared/gymSession.ts';
import { getCorsHeaders, handleOptions, jsonResponse } from '../_shared/http.ts';
import { getCalendarMonthWindowStrings } from '../_shared/schedule.ts';

interface CalendarEntry {
  idLesson: unknown;
  idService: unknown;
  date: string;
  startTime: string;
  endTime: string;
  service: string;
  category: string;
  availablePlaces: number;
  isUserPresent: boolean;
  waitingListPosition: number;
  maxBookings: number;
  webMaxUser: number;
  isLocked: number;
}

// Return a calendar-like list of bookable classes grouped by date.
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
    const windowStrings = getCalendarMonthWindowStrings(timeZone);

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
    const byDate: Record<string, CalendarEntry[]> = {};
    let maxDate = '';

    items.forEach((item) => {
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

      const entry: CalendarEntry = {
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
    let endDate = windowStrings.currentMonthEndDate;
    if (maxDate) {
      endDate = maxDate > windowStrings.currentMonthEndDate
        ? maxDate
        : windowStrings.currentMonthEndDate;
    }

    return jsonResponse(
      {
        start_date: windowStrings.startDate,
        end_date: endDate,
        days,
      },
      200,
      corsHeaders,
    );
  } catch (err: unknown) {
    if (err instanceof UserCredentialsNotFoundError) {
      return jsonResponse({ error: 'User credentials not found' }, 404, corsHeaders);
    }
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});

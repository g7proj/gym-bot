import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth } from '../_shared/auth.ts';
import { listWithMine } from '../_shared/gymClient.ts';
import { UserCredentialsNotFoundError, withGymSession } from '../_shared/gymSession.ts';
import { getCorsHeaders, handleOptions } from '../_shared/http.ts';
import { getCalendarMonthWindowStrings } from '../_shared/schedule.ts';

// Return a calendar-like list of bookable classes grouped by date.
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return handleOptions(corsHeaders);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    const authResult = await requireAuth(req, supabaseUrl, supabaseServiceRoleKey, corsHeaders);
    if (authResult.errorResponse) {
      return authResult.errorResponse;
    }
    const user = authResult.user;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

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
    let endDate = windowStrings.currentMonthEndDate;
    if (maxDate) {
      endDate = maxDate > windowStrings.currentMonthEndDate
        ? maxDate
        : windowStrings.currentMonthEndDate;
    }

    return new Response(JSON.stringify({
      start_date: windowStrings.startDate,
      end_date: endDate,
      days,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    if (err instanceof UserCredentialsNotFoundError) {
      return new Response(JSON.stringify({ error: 'User credentials not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ error: err?.message || 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

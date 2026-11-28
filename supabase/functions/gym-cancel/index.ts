import { createSupabaseAdmin, requireAuth } from '../_shared/auth.ts';
import { cancelBooking, removeWait } from '../_shared/gymClient.ts';
import { UserCredentialsNotFoundError, withGymSession } from '../_shared/gymSession.ts';
import { getCorsHeaders, handleOptions, jsonResponse } from '../_shared/http.ts';

// Cancel a booking or remove the user from the waitlist.
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

    const body = await req.json();
    const bookingId = Number(body?.bookingId);
    const idLesson = Number(body?.idLesson ?? 0);
    const date = String(body?.date || '').trim();
    const startTimeRaw = String(body?.startTime || '').trim();
    const endTimeRaw = String(body?.endTime || '').trim();

    // Support both ISO timestamps and date + time fragments from the UI.
    const startTime = startTimeRaw.includes('T')
      ? startTimeRaw
      : (date ? `${date}T${startTimeRaw}:00` : startTimeRaw);
    const endTime = endTimeRaw.includes('T')
      ? endTimeRaw
      : (date ? `${date}T${endTimeRaw}:00` : endTimeRaw);

    const type = Number.isFinite(body?.type) ? Number(body.type) : 0;
    const idDurata = Number.isFinite(body?.idDurata) ? Number(body.idDurata) : 0;
    const isUserPresent = Boolean(body?.isUserPresent);

    if (!bookingId || !startTime || !endTime) {
      return jsonResponse({ error: 'Missing cancel fields' }, 400, corsHeaders);
    }

    const payload = {
      BookingID: bookingId,
      IDLesson: idLesson,
      Type: type,
      StartTime: startTime,
      EndTime: endTime,
      IDDurata: idDurata,
    };

    const supabaseAdmin = createSupabaseAdmin(supabaseUrl, supabaseServiceRoleKey);

    // If the user isn't confirmed, canceling means removing from the waitlist.
    const response = await withGymSession(
      supabaseAdmin,
      user.id,
      (gymToken) => (isUserPresent ? cancelBooking(gymToken, payload) : removeWait(gymToken, payload)),
      { idempotent: false },
    );

    return jsonResponse({ success: true, response }, 200, corsHeaders);
  } catch (err: unknown) {
    if (err instanceof UserCredentialsNotFoundError) {
      return jsonResponse({ error: 'User credentials not found' }, 404, corsHeaders);
    }
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});

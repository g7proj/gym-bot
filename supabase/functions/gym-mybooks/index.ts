import { createSupabaseAdmin, requireAuth } from '../_shared/auth.ts';
import { myBookings } from '../_shared/gymClient.ts';
import { UserCredentialsNotFoundError, withGymSession } from '../_shared/gymSession.ts';
import { getCorsHeaders, handleOptions, jsonResponse } from '../_shared/http.ts';

// Return the user's current bookings in a normalized, UI-friendly format.
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

    const response = await withGymSession(
      supabaseAdmin,
      user.id,
      (gymToken) => myBookings(gymToken),
      { idempotent: true },
    );
    const items = Array.isArray(response?.Items)
      ? (response.Items as Record<string, unknown>[])
      : [];

    const normalized = items
      // Ignore non-fitness categories to keep the UI focused.
      .filter((item) => String(item?.CategoryDescription || '').trim() === 'CORSI FIT')
      .map((item) => ({
        bookingId: item?.BookingID ?? null,
        idLesson: item?.IDLesson ?? null,
        type: item?.Type ?? 0,
        idDurata: item?.IDDurata ?? 0,
        date: String(item?.StartTime || '').slice(0, 10),
        startTime: String(item?.StartTime || '').slice(11, 16),
        endTime: String(item?.EndTime || '').slice(11, 16),
        isUserPresent: Number(item?.IsUserPresent ?? 0) === 1,
        waitingListPosition: Number(item?.UserPositionWaitingList ?? 0),
        service: String(item?.ServiceDescription || '').trim(),
        category: String(item?.CategoryDescription || '').trim(),
        additionalInfo: String(item?.AdditionalInfo || '').trim(),
      }));

    return jsonResponse({ items: normalized }, 200, corsHeaders);
  } catch (err: unknown) {
    if (err instanceof UserCredentialsNotFoundError) {
      return jsonResponse({ error: 'User credentials not found' }, 404, corsHeaders);
    }
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});

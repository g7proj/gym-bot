import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth } from '../_shared/auth.ts';
import { addWait, bookLesson } from '../_shared/gymClient.ts';
import { UserCredentialsNotFoundError, withGymSession } from '../_shared/gymSession.ts';
import { getCorsHeaders, handleOptions } from '../_shared/http.ts';

// Book a class or place the user on the waitlist depending on seat availability.
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

    const body = await req.json();
    const idService = Number(body?.idService);
    const idLesson = Number(body?.idLesson);
    const date = String(body?.date || '').trim();
    const startTimeRaw = String(body?.startTime || '').trim();
    const endTimeRaw = String(body?.endTime || '').trim();
    // Accept either full ISO timestamps or date + time fragments.
    const startTime =
      startTimeRaw.includes('T')
        ? startTimeRaw
        : (date ? `${date}T${startTimeRaw}:00` : startTimeRaw);

    const endTime =
      endTimeRaw.includes('T')
        ? endTimeRaw
        : (date ? `${date}T${endTimeRaw}:00` : endTimeRaw);
    const type = Number.isFinite(body?.type) ? Number(body.type) : 0;
    const idDurata = Number.isFinite(body?.idDurata) ? Number(body.idDurata) : 0;
    const bookNr = Number.isFinite(body?.bookNr) ? Number(body.bookNr) : 0;
    const availablePlaces = Number(body?.availablePlaces ?? 0);
    const waitingListPosition = Number(body?.waitingListPosition ?? 0);
    const isUserPresent = Boolean(body?.isUserPresent);

    if (!idService || !idLesson || !startTime || !endTime) {
      return new Response(JSON.stringify({ error: 'Missing booking fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Avoid duplicate bookings or waitlist entries from the UI.
    if (isUserPresent || waitingListPosition > 0) {
      return new Response(JSON.stringify({ error: 'Already booked or in waiting list' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = {
      Note: '',
      BookNr: bookNr,
      BookingID: idService,
      StartTime: startTime,
      EndTime: endTime,
      IDLesson: idLesson,
      Type: type,
      IDDurata: idDurata,
    };

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // If no slots are available, fall back to waitlist.
    const response = await withGymSession(
      supabaseAdmin,
      user.id,
      (gymToken) => (availablePlaces > 0 ? bookLesson(gymToken, payload) : addWait(gymToken, payload)),
      { idempotent: false },
    );

    return new Response(JSON.stringify({ success: true, response }), {
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

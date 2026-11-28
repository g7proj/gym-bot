import { createSupabaseAdmin } from '../_shared/auth.ts';
import { runAutoBooking, verifyCronSecret } from '../_shared/autoBook.ts';
import { getCorsHeaders, handleOptions, jsonResponse } from '../_shared/http.ts';

// Scheduled machine-to-machine endpoint that books preferred lesson slots for all users.
Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return handleOptions(corsHeaders);
  }

  try {
    const cronSecret = Deno.env.get('CRON_SECRET') || '';
    if (!cronSecret) {
      return jsonResponse({ error: 'CRON_SECRET secret is not configured' }, 500, corsHeaders);
    }

    const authHeader = req.headers.get('authorization') || '';
    const authorized = await verifyCronSecret(authHeader, cronSecret);
    if (!authorized) {
      return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return jsonResponse({ error: 'Supabase configuration missing' }, 500, corsHeaders);
    }

    let dryRun = false;
    let forceTime = false;
    const rawBody = await req.text();
    if (rawBody.trim()) {
      const parsed = JSON.parse(rawBody);
      dryRun = Boolean(parsed?.dryRun);
      forceTime = Boolean(parsed?.forceTime);
    }

    const supabaseAdmin = createSupabaseAdmin(supabaseUrl, supabaseServiceRoleKey);
    const summary = await runAutoBooking(supabaseAdmin, { dryRun, forceTime });
    return jsonResponse({ success: true, ...summary }, 200, corsHeaders);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});

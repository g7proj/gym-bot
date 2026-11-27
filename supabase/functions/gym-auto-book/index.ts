import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { runAutoBooking, verifyCronSecret } from '../_shared/autoBook.ts';
import { getCorsHeaders, handleOptions, jsonResponse } from '../_shared/http.ts';

// Scheduled machine-to-machine endpoint that books preferred lesson slots for all users.
serve(async (req) => {
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

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const summary = await runAutoBooking(supabaseAdmin, { dryRun, forceTime });
    return jsonResponse({ success: true, ...summary }, 200, corsHeaders);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});

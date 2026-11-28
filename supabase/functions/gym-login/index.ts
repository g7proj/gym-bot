import { createSupabaseAdmin, requireAuth } from '../_shared/auth.ts';
import { encryptString } from '../_shared/crypto.ts';
import { gymLogin } from '../_shared/gymClient.ts';
import { cacheGymToken } from '../_shared/gymSession.ts';
import { getCorsHeaders, handleOptions, jsonResponse } from '../_shared/http.ts';

// Validate gym credentials and store them encrypted for the logged-in user.
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
    const username = String(body?.username || '').trim();
    const password = String(body?.password || '');

    if (!username || !password) {
      return jsonResponse({ error: 'Missing credentials' }, 400, corsHeaders);
    }

    // Only persist credentials after a successful gym login.
    const gymToken = await gymLogin(username, password);
    const encrypted = await encryptString(password);

    const supabaseAdmin = createSupabaseAdmin(supabaseUrl, supabaseServiceRoleKey);

    // Enforce unique username by removing any older account record.
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (existingUser?.id && existingUser.id !== user.id) {
      await supabaseAdmin.from('preferences').delete().eq('user_id', existingUser.id);
      await supabaseAdmin.from('users').delete().eq('id', existingUser.id);
    }

    const { error: upsertError } = await supabaseAdmin.from('users').upsert(
      {
        id: user.id,
        username,
        password_encrypted: encrypted,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );

    if (upsertError) {
      return jsonResponse({ error: upsertError.message }, 500, corsHeaders);
    }

    // Warm the session cache so immediate calendar/courses/mybooks requests skip re-login.
    await cacheGymToken(supabaseAdmin, user.id, gymToken);

    return jsonResponse({ user_id: user.id, username }, 200, corsHeaders);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});

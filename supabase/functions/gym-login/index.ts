import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encryptString } from '../_shared/crypto.ts';
import { requireAuth } from '../_shared/auth.ts';
import { gymLogin } from '../_shared/gymClient.ts';
import { getCorsHeaders, handleOptions } from '../_shared/http.ts';

// Validate gym credentials and store them encrypted for the logged-in user.
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
    const username = String(body?.username || '').trim();
    const password = String(body?.password || '');

    if (!username || !password) {
      return new Response(JSON.stringify({ error: 'Missing credentials' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only persist credentials after a successful gym login.
    await gymLogin(username, password);
    const encrypted = await encryptString(password);

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Keep Supabase Auth password in sync with the gym password.
    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { password },
    );

    if (authUpdateError) {
      return new Response(JSON.stringify({ error: authUpdateError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
      return new Response(JSON.stringify({ error: upsertError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ user_id: user.id, username }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message || 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

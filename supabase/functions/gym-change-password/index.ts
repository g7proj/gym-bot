import { createSupabaseAdmin, createSupabaseUserClient, requireAuth } from '../_shared/auth.ts';
import { encryptString } from '../_shared/crypto.ts';
import { changePassword, gymLogin } from '../_shared/gymClient.ts';
import { invalidateGymToken } from '../_shared/gymSession.ts';
import { getCorsHeaders, handleOptions, jsonResponse } from '../_shared/http.ts';

// Change the gym password and keep Supabase credentials in sync.
Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return handleOptions(corsHeaders);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const authHeader = req.headers.get('authorization') || '';

    const authResult = await requireAuth(req, supabaseUrl, supabaseServiceRoleKey, corsHeaders);
    if (authResult.errorResponse || !authResult.user) {
      return authResult.errorResponse!;
    }
    const user = authResult.user;

    const body = await req.json();
    const oldPassword = String(body?.oldPassword || '');
    const newPassword = String(body?.newPassword || '');

    if (!oldPassword || !newPassword) {
      return jsonResponse({ error: 'Missing password fields' }, 400, corsHeaders);
    }

    const supabase = createSupabaseUserClient(supabaseUrl, supabaseAnonKey, authHeader);
    const { data: userRow, error: userRowError } = await supabase
      .from('users')
      .select('username, password_encrypted')
      .eq('id', user.id)
      .single();

    if (userRowError || !userRow?.password_encrypted) {
      return jsonResponse({ error: 'User credentials not found' }, 404, corsHeaders);
    }

    // Validate old password by logging in, then call change password.
    const gymToken = await gymLogin(userRow.username, oldPassword);
    await changePassword(gymToken, oldPassword, newPassword);

    const encrypted = await encryptString(newPassword);
    const supabaseAdmin = createSupabaseAdmin(supabaseUrl, supabaseServiceRoleKey);

    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { password: newPassword },
    );

    if (authUpdateError) {
      return jsonResponse({ error: authUpdateError.message }, 500, corsHeaders);
    }

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ password_encrypted: encrypted, updated_at: new Date().toISOString() })
      .eq('id', user.id);

    if (updateError) {
      return jsonResponse({ error: updateError.message }, 500, corsHeaders);
    }

    await invalidateGymToken(supabaseAdmin, user.id);

    return jsonResponse({ success: true }, 200, corsHeaders);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});

import { createSupabaseAdmin } from '../_shared/auth.ts';
import { encryptString } from '../_shared/crypto.ts';
import { gymLogin } from '../_shared/gymClient.ts';
import { cacheGymToken } from '../_shared/gymSession.ts';
import { getCorsHeaders, handleOptions, jsonResponse } from '../_shared/http.ts';

function usernameToEmail(username: string): string {
  const cleaned = String(username || '').trim().toLowerCase();
  return `${cleaned}@gymbot.example`;
}

// Recover a Supabase Auth account by validating gym credentials first.
Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return handleOptions(corsHeaders);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    const supabaseAdmin = createSupabaseAdmin(supabaseUrl, supabaseServiceRoleKey);

    const body = await req.json();
    const username = String(body?.username || '').trim();
    const password = String(body?.password || '');

    if (!username || !password) {
      return jsonResponse({ error: 'Missing credentials' }, 400, corsHeaders);
    }

    // Only reset the auth password if the gym login succeeds.
    const gymToken = await gymLogin(username, password);
    const email = usernameToEmail(username);

    // Look up directly in public.users first, then paginate auth users as fallback.
    let authUserId: string | null = null;
    const { data: profileRow } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (profileRow?.id) {
      authUserId = String(profileRow.id);
    } else {
      const perPage = 200;
      for (let page = 1; ; page += 1) {
        const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
          page,
          perPage,
        });

        if (listError) {
          return jsonResponse({ error: listError.message }, 500, corsHeaders);
        }

        const users = listData?.users || [];
        const found = users.find((item) => item.email === email);
        if (found?.id) {
          authUserId = found.id;
          break;
        }
        if (users.length < perPage) {
          break;
        }
      }
    }

    if (!authUserId) {
      return jsonResponse({ error: 'Auth user not found' }, 404, corsHeaders);
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      authUserId,
      { password },
    );

    if (updateError) {
      return jsonResponse({ error: updateError.message }, 500, corsHeaders);
    }

    const encrypted = await encryptString(password);

    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (existingUser?.id && existingUser.id !== authUserId) {
      await supabaseAdmin.from('preferences').delete().eq('user_id', existingUser.id);
      await supabaseAdmin.from('users').delete().eq('id', existingUser.id);
    }

    const { error: upsertError } = await supabaseAdmin.from('users').upsert(
      {
        id: authUserId,
        username,
        password_encrypted: encrypted,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );

    if (upsertError) {
      return jsonResponse({ error: upsertError.message }, 500, corsHeaders);
    }

    await cacheGymToken(supabaseAdmin, authUserId, gymToken);

    return jsonResponse({ success: true }, 200, corsHeaders);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encryptString } from '../_shared/crypto.ts';
import { gymLogin } from '../_shared/gymClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function usernameToEmail(username: string): string {
  const cleaned = String(username || '').trim().toLowerCase();
  return `${cleaned}@gymbot.example`;
}

// Recover a Supabase Auth account by validating gym credentials first.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    const body = await req.json();
    const username = String(body?.username || '').trim();
    const password = String(body?.password || '');

    if (!username || !password) {
      return new Response(JSON.stringify({ error: 'Missing credentials' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only reset the auth password if the gym login succeeds.
    await gymLogin(username, password);

    const email = usernameToEmail(username);

    // Look up directly in public.users first, then paginate auth users as fallback.
    let authUserId: string | null = null;
    const { data: profileRow } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (profileRow?.id) {
      authUserId = profileRow.id;
    } else {
      const perPage = 200;
      for (let page = 1; ; page += 1) {
        const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
          page,
          perPage,
        });

        if (listError) {
          return new Response(JSON.stringify({ error: listError.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
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
      return new Response(JSON.stringify({ error: 'Auth user not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      authUserId,
      { password },
    );

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
      return new Response(JSON.stringify({ error: upsertError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
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

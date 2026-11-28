import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.49.4';

/** Create a service-role Supabase client with session persistence disabled for Edge Functions. */
export function createSupabaseAdmin(
  supabaseUrl: string,
  serviceRoleKey: string,
): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/** Create a request-scoped Supabase client forwarding the caller's Authorization header. */
export function createSupabaseUserClient(
  supabaseUrl: string,
  anonKey: string,
  authHeader: string,
): SupabaseClient {
  return createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: { Authorization: authHeader },
    },
  });
}

export async function requireAuth(
  req: Request,
  supabaseUrl: string,
  serviceRoleKey: string,
  corsHeaders: Record<string, string>,
): Promise<{ user: User | null; errorResponse?: Response }> {
  const authHeader = req.headers.get('authorization') || '';
  const authToken = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!authToken) {
    return {
      user: null,
      errorResponse: new Response(JSON.stringify({ error: 'Missing auth token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      user: null,
      errorResponse: new Response(JSON.stringify({ error: 'Auth configuration missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }

  // Verify the JWT cryptographically via GoTrue rather than trusting unverified token claims.
  const supabaseAdmin = createSupabaseAdmin(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabaseAdmin.auth.getUser(authToken);

  if (error || !data?.user) {
    return {
      user: null,
      errorResponse: new Response(JSON.stringify({ error: error?.message || 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }

  return { user: data.user };
}

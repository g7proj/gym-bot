import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export async function requireAuth(
  req: Request,
  supabaseUrl: string,
  serviceRoleKey: string,
  corsHeaders: Record<string, string>,
): Promise<{ user: any | null; errorResponse?: Response }> {
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
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
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


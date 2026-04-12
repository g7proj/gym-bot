import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return atob(padded);
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const json = decodeBase64Url(parts[1]);
    return JSON.parse(json);
  } catch (_err) {
    return null;
  }
}

function isAudienceValid(aud: unknown): boolean {
  if (typeof aud === 'string') return aud === 'authenticated';
  if (Array.isArray(aud)) return aud.includes('authenticated');
  return false;
}

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

  const payload = parseJwtPayload(authToken);
  const iss = typeof payload?.iss === 'string' ? payload.iss : '';
  const sub = typeof payload?.sub === 'string' ? payload.sub : '';
  const exp = typeof payload?.exp === 'number' ? payload.exp : 0;

  if (!payload || !sub || !iss || !isAudienceValid(payload?.aud)) {
    return {
      user: null,
      errorResponse: new Response(JSON.stringify({ error: 'Invalid auth token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }

  const expectedIss = `${supabaseUrl}/auth/v1`;
  if (iss !== expectedIss) {
    return {
      user: null,
      errorResponse: new Response(JSON.stringify({ error: 'Invalid token issuer' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (exp && exp <= nowSec) {
    return {
      user: null,
      errorResponse: new Response(JSON.stringify({ error: 'Auth token expired' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(sub);

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


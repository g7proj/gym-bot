/**
 * Shared HTTP utilities for Supabase Edge Functions:
 * - Origin-restricted CORS headers (configurable via ALLOWED_ORIGINS)
 * - Standard JSON response builder
 */

const DEFAULT_ALLOWED_ORIGINS = [
  'https://g7proj.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

function parseAllowedOrigins(): string[] {
  const configured = Deno.env.get('ALLOWED_ORIGINS');
  if (!configured) {
    return DEFAULT_ALLOWED_ORIGINS;
  }
  const parsed = configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_ALLOWED_ORIGINS;
}

/**
 * Build CORS headers for the incoming request.
 * Echoes the request Origin only if it matches the allow-list (or '*' if explicitly configured).
 */
export function getCorsHeaders(req: Request): Record<string, string> {
  const allowedOrigins = parseAllowedOrigins();
  const requestOrigin = req.headers.get('origin') || '';

  let allowOrigin = allowedOrigins[0];
  if (allowedOrigins.includes('*')) {
    allowOrigin = '*';
  } else if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    allowOrigin = requestOrigin;
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

/** Return a standard JSON response with CORS headers attached. */
export function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Handle CORS preflight OPTIONS requests. */
export function handleOptions(corsHeaders: Record<string, string>): Response {
  return new Response('ok', { headers: corsHeaders });
}

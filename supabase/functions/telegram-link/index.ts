import { createSupabaseAdmin, requireAuth } from '../_shared/auth.ts';
import { getCorsHeaders, handleOptions, jsonResponse } from '../_shared/http.ts';
import { generateLinkToken, resolveBotUsername } from '../_shared/telegram.ts';

const LINK_TTL_SECONDS = 900; // 15 minutes

// Create a single-use Telegram deep link (`t.me/<bot>?start=<token>`) or disconnect alerts.
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

    let action = 'create';
    const rawBody = await req.text();
    if (rawBody.trim()) {
      const parsed = JSON.parse(rawBody);
      if (parsed?.action) {
        action = String(parsed.action).trim().toLowerCase();
      }
    }

    const supabaseAdmin = createSupabaseAdmin(supabaseUrl, supabaseServiceRoleKey);

    if (action === 'disconnect') {
      await Promise.all([
        supabaseAdmin.from('telegram_connections').delete().eq('user_id', user.id),
        supabaseAdmin.from('telegram_link_tokens').delete().eq('user_id', user.id),
      ]);
      return jsonResponse({ success: true }, 200, corsHeaders);
    }

    if (action !== 'create') {
      return jsonResponse({ error: 'Invalid action' }, 400, corsHeaders);
    }

    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
    const configuredBotUsername = Deno.env.get('TELEGRAM_BOT_USERNAME') || '';
    if (!botToken.trim()) {
      return jsonResponse(
        { error: 'Telegram notifications are not configured on the server' },
        503,
        corsHeaders,
      );
    }

    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (!userRow?.id) {
      return jsonResponse({ error: 'User profile not found' }, 404, corsHeaders);
    }

    const botUsername = await resolveBotUsername(botToken, configuredBotUsername);
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const expiresAtIso = new Date(nowMs + LINK_TTL_SECONDS * 1000).toISOString();

    // Opportunistically purge expired tokens and replace any active token for this user.
    await supabaseAdmin.from('telegram_link_tokens').delete().lt('expires_at', nowIso);
    await supabaseAdmin.from('telegram_link_tokens').delete().eq('user_id', user.id);

    const { token, tokenHash } = await generateLinkToken();
    const { error: insertError } = await supabaseAdmin.from('telegram_link_tokens').insert({
      token_hash: tokenHash,
      user_id: user.id,
      expires_at: expiresAtIso,
    });

    if (insertError) {
      return jsonResponse({ error: 'Failed to create link token' }, 500, corsHeaders);
    }

    return jsonResponse(
      {
        url: `https://t.me/${botUsername}?start=${token}`,
        bot_username: botUsername,
        expires_at: expiresAtIso,
        expires_in_seconds: LINK_TTL_SECONDS,
      },
      200,
      corsHeaders,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleOptions, jsonResponse } from '../_shared/http.ts';
import {
  processTelegramWebhookUpdate,
  verifyTelegramWebhookSecret,
} from '../_shared/telegram.ts';

// Webhook receiver invoked by Telegram servers when a user taps Start (`/start <token>`).
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return handleOptions(corsHeaders);
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  try {
    const webhookSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') || '';
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
    if (!webhookSecret.trim() || !botToken.trim()) {
      return jsonResponse({ error: 'Telegram webhook is not configured' }, 500, corsHeaders);
    }

    const headerSecret = req.headers.get('x-telegram-bot-api-secret-token') || '';
    const verified = await verifyTelegramWebhookSecret(headerSecret, webhookSecret);
    if (!verified) {
      return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return jsonResponse({ error: 'Supabase configuration missing' }, 500, corsHeaders);
    }

    const update = await req.json();
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const result = await processTelegramWebhookUpdate(supabaseAdmin, update, botToken);
    return jsonResponse({ ok: true, ...result }, 200, corsHeaders);
  } catch (_err) {
    // Return 200 on malformed update bodies after auth check? Keep 500 only on genuine failures.
    return jsonResponse({ error: 'Webhook processing error' }, 500, corsHeaders);
  }
});

/**
 * Shared Telegram Bot utilities for deep-link account pairing and
 * best-effort automated booking error notifications.
 *
 * Security invariants:
 * - Zero external imports so offline Deno unit tests run without network access.
 * - Constant-time verification of `X-Telegram-Bot-Api-Secret-Token`.
 * - Single-use, short-lived, SHA-256 hashed deep-link tokens (`[A-Za-z0-9_-]`, 32 chars).
 * - Never leak `TELEGRAM_BOT_TOKEN` or sensitive URLs in thrown errors or messages.
 */

const TELEGRAM_API_BASE = 'https://api.telegram.org';
const TELEGRAM_TIMEOUT_MS = 5000;
const LINK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const BOT_USERNAME_PATTERN = /^[A-Za-z0-9_]{3,64}$/;

const encoder = new TextEncoder();
let cachedBotUsername = '';

/**
 * Constant-time verification of Telegram's `X-Telegram-Bot-Api-Secret-Token` header.
 */
export async function verifyTelegramWebhookSecret(
  headerSecret: string,
  expectedSecret: string,
): Promise<boolean> {
  const trimmedExpected = String(expectedSecret || '').trim();
  const actual = String(headerSecret || '').trim();
  if (!trimmedExpected || !actual) {
    return false;
  }

  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(actual)),
    crypto.subtle.digest('SHA-256', encoder.encode(trimmedExpected)),
  ]);

  const a = new Uint8Array(actualHash);
  const b = new Uint8Array(expectedHash);
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length && i < b.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/** Compute lowercase hex SHA-256 digest of a deep-link token. */
export async function hashLinkToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a 192-bit URL-safe base64 token (32 chars, within Telegram's 64-char `start` limit)
 * along with its SHA-256 hex hash for database storage.
 */
export async function generateLinkToken(): Promise<{ token: string; tokenHash: string }> {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  const token = btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  const tokenHash = await hashLinkToken(token);
  return { token, tokenHash };
}

/** Escape dynamic strings for Telegram `parse_mode: "HTML"`. */
export function escapeTelegramHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Strip URLs and collapse whitespace so error messages stay compact and secret-safe. */
export function sanitizeErrorDetail(rawError: unknown, maxLength = 240): string {
  const cleaned = String(rawError || 'Unknown error')
    .replace(/https?:\/\/\S+/gi, '[redacted-url]')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'Unknown error';
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
}

/** Detect whether an error likely stems from an expired or changed gym portal password. */
export function isLikelyPasswordOrAuthIssue(rawError: unknown): boolean {
  const text = String(rawError || '').toLowerCase();
  return (
    text.includes('login')
    || text.includes('password')
    || text.includes('credential')
    || text.includes('unauthorized')
    || text.includes('authentication')
    || text.includes('expired')
    || text.includes('scadut')
    || text.includes('401')
    || text.includes('403')
  );
}

export interface AutoBookErrorAlertParams {
  username: string;
  targetDate: string;
  targetWeekday: string;
  desiredCourses?: string[];
  error: string;
}

/** Format an HTML alert message for a failed automated booking run. */
export function formatAutoBookErrorAlert(params: AutoBookErrorAlertParams): string {
  const weekdayLabel = params.targetWeekday
    ? params.targetWeekday.charAt(0).toUpperCase() + params.targetWeekday.slice(1)
    : '';
  const sanitizedError = sanitizeErrorDetail(params.error);

  const lines = [
    '⚠️ <b>Gym Bot — Auto-book failed</b>',
    `Account: <code>${escapeTelegramHtml(params.username || 'unknown')}</code>`,
    `Target: <b>${escapeTelegramHtml(weekdayLabel)} · ${escapeTelegramHtml(params.targetDate)}</b>`,
  ];

  if (Array.isArray(params.desiredCourses) && params.desiredCourses.length > 0) {
    lines.push(`Slots: <code>${escapeTelegramHtml(params.desiredCourses.join(', '))}</code>`);
  }

  lines.push(`Reason: <code>${escapeTelegramHtml(sanitizedError)}</code>`);

  if (isLikelyPasswordOrAuthIssue(params.error)) {
    lines.push(
      '',
      '💡 Your gym portal password may have expired or changed. Sign in to Gym Bot with your updated password to resync.',
    );
  }

  return lines.join('\n');
}

/**
 * Send an HTML message via the Telegram Bot API with a short timeout.
 * Never throws and never exposes `botToken`.
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  htmlText: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const trimmedToken = String(botToken || '').trim();
  const trimmedChat = String(chatId || '').trim();
  if (!trimmedToken || !trimmedChat || !htmlText) {
    return false;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${TELEGRAM_API_BASE}/bot${trimmedToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: trimmedChat,
        text: htmlText,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      return false;
    }
    const payload = await res.json().catch(() => null);
    return Boolean(payload?.ok);
  } catch (_err) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve the bot's public username from `TELEGRAM_BOT_USERNAME` or via `getMe`.
 * Never includes `botToken` in error messages.
 */
export async function resolveBotUsername(
  botToken: string,
  configuredUsername = '',
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const explicit = String(configuredUsername || '').trim().replace(/^@/, '');
  if (explicit) {
    if (!BOT_USERNAME_PATTERN.test(explicit)) {
      throw new Error('Invalid TELEGRAM_BOT_USERNAME format');
    }
    return explicit;
  }

  if (cachedBotUsername) {
    return cachedBotUsername;
  }

  const trimmedToken = String(botToken || '').trim();
  if (!trimmedToken) {
    throw new Error('Telegram bot is not configured');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${TELEGRAM_API_BASE}/bot${trimmedToken}/getMe`, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Telegram getMe failed with status ${res.status}`);
    }
    const data = await res.json();
    const username = String(data?.result?.username || '').trim();
    if (!username || !BOT_USERNAME_PATTERN.test(username)) {
      throw new Error('Unable to resolve Telegram bot username');
    }
    cachedBotUsername = username;
    return username;
  } catch (err) {
    if (err instanceof Error && !err.message.includes(trimmedToken)) {
      throw err;
    }
    throw new Error('Unable to reach Telegram API');
  } finally {
    clearTimeout(timer);
  }
}

export interface WebhookDeps {
  now?: () => Date;
  sendMessageFn?: (botToken: string, chatId: string, htmlText: string) => Promise<boolean>;
}

/**
 * Process an incoming Telegram webhook update (`/start <token>`, `/start`, `/stop`).
 */
export async function processTelegramWebhookUpdate(
  supabaseAdmin: any,
  update: Record<string, any>,
  botToken: string,
  deps: WebhookDeps = {},
): Promise<{ action: string }> {
  const message = update?.message;
  const chat = message?.chat;
  if (!chat?.id || typeof message?.text !== 'string') {
    return { action: 'ignored' };
  }

  // Only link private 1-on-1 chats, never group or channel chats.
  if (chat.type && chat.type !== 'private') {
    return { action: 'ignored_non_private' };
  }

  const chatId = String(chat.id);
  const text = message.text.trim();
  const nowFn = deps.now || (() => new Date());
  const sendFn = deps.sendMessageFn || sendTelegramMessage;

  if (/^\/(stop|disconnect)(?:@\S+)?$/i.test(text)) {
    await supabaseAdmin
      .from('telegram_connections')
      .delete()
      .eq('chat_id', chatId);

    await sendFn(
      botToken,
      chatId,
      '🔕 <b>Notifications disconnected.</b>\nYou can reconnect anytime from the Gym Bot app.',
    );
    return { action: 'disconnected' };
  }

  const startMatch = text.match(/^\/start(?:@\S+)?(?:\s+(\S+))?$/i);
  if (!startMatch) {
    return { action: 'ignored' };
  }

  const rawToken = startMatch[1] || '';
  if (!rawToken) {
    await sendFn(
      botToken,
      chatId,
      '👋 Open the <b>Gym Bot</b> web app, sign in, and tap <b>Connect Telegram</b> to enable 07:01 auto-booking error alerts.',
    );
    return { action: 'welcome' };
  }

  if (!LINK_TOKEN_PATTERN.test(rawToken)) {
    await sendFn(
      botToken,
      chatId,
      '⚠️ Invalid link code. Open Gym Bot and generate a new Telegram link.',
    );
    return { action: 'invalid_token' };
  }

  const nowIso = nowFn().toISOString();
  const tokenHash = await hashLinkToken(rawToken);

  const { data: tokenRow, error: tokenError } = await supabaseAdmin
    .from('telegram_link_tokens')
    .delete()
    .eq('token_hash', tokenHash)
    .gt('expires_at', nowIso)
    .select('user_id')
    .maybeSingle();

  if (tokenError || !tokenRow?.user_id) {
    await sendFn(
      botToken,
      chatId,
      '⚠️ This link has expired or was already used. Open Gym Bot and tap <b>Connect Telegram</b> again.',
    );
    return { action: 'expired_token' };
  }

  const userId = String(tokenRow.user_id);
  const { data: userRow } = await supabaseAdmin
    .from('users')
    .select('username')
    .eq('id', userId)
    .maybeSingle();

  if (!userRow?.username) {
    return { action: 'missing_user' };
  }

  const fromUser = message.from;
  const telegramLabel = fromUser?.username
    ? `@${String(fromUser.username).trim()}`
    : fromUser?.first_name
      ? String(fromUser.first_name).trim()
      : null;

  const { error: upsertError } = await supabaseAdmin
    .from('telegram_connections')
    .upsert(
      {
        user_id: userId,
        chat_id: chatId,
        telegram_username: telegramLabel,
        enabled: true,
        connected_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: 'user_id' },
    );

  if (upsertError) {
    await sendFn(
      botToken,
      chatId,
      '⚠️ Unable to save Telegram connection right now. Please try again shortly.',
    );
    return { action: 'db_error' };
  }

  await sendFn(
    botToken,
    chatId,
    [
      '✅ <b>Gym Bot connected</b>',
      `Account: <code>${escapeTelegramHtml(userRow.username)}</code>`,
      '',
      'You will receive an alert here if an automated 07:01 booking fails (for example when your gym password expires).',
      'Send /stop anytime to disconnect.',
    ].join('\n'),
  );

  return { action: 'connected' };
}

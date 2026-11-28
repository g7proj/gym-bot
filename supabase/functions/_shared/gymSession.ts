/**
 * Encrypted short-lived cache for InfoYou session tokens (`AuthToken`).
 *
 * Avoids repeating `/security/webauthenticate` on every Edge Function call while
 * automatically refreshing and retrying once if a cached token is rejected upstream.
 */
import { decryptString, encryptString } from './crypto.ts';
import { gymLogin } from './gymClient.ts';

const DEFAULT_TTL_MINUTES = 15;
const EXPIRY_BUFFER_MS = 30_000;

/**
 * Structural client alias used by shared modules so offline unit tests can pass lightweight mocks
 * without importing external npm packages into `_shared/`.
 */
// deno-lint-ignore no-explicit-any
export type SupabaseAdminLike = any;

export class UserCredentialsNotFoundError extends Error {
  constructor(message = 'User credentials not found') {
    super(message);
    this.name = 'UserCredentialsNotFoundError';
  }
}

export interface GymSessionOptions {
  /**
   * Set true for read-only idempotent calls (courses, calendar, mybooks) so any
   * non-network portal error on a cached token triggers one fresh re-login.
   * Keep false for mutating calls (book, cancel) so only auth/session rejections retry.
   */
  idempotent?: boolean;
  ttlMinutes?: number;
  now?: () => number;
  loginFn?: (username: string, password: string) => Promise<string>;
}

function resolveTtlMinutes(explicit?: number): number {
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }
  const raw = Number(Deno.env.get('GYM_TOKEN_TTL_MINUTES') || '');
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return DEFAULT_TTL_MINUTES;
}

/** Detect whether an upstream InfoYou error indicates an expired or invalid AuthToken. */
export function isAuthSessionError(err: unknown): boolean {
  const message = String(err instanceof Error ? err.message : err || '').toLowerCase();
  if (!message) return false;
  if (message.includes('http 401') || message.includes('http 403')) {
    return true;
  }
  const authKeywords = [
    'unauthoriz',
    'authtoken',
    'token',
    'session',
    'not logged',
    'login',
    'expired',
    'scadut',
    'autentic',
  ];
  return authKeywords.some((kw) => message.includes(kw));
}

/** Encrypt and persist an InfoYou AuthToken in `public.gym_session_cache` (best-effort). */
export async function cacheGymToken(
  supabaseAdmin: SupabaseAdminLike,
  userId: string,
  token: string,
  options?: Pick<GymSessionOptions, 'ttlMinutes' | 'now'>,
): Promise<void> {
  try {
    const nowMs = options?.now ? options.now() : Date.now();
    const ttlMinutes = resolveTtlMinutes(options?.ttlMinutes);
    const encrypted = await encryptString(token);
    const expiresAt = new Date(nowMs + ttlMinutes * 60_000).toISOString();
    await supabaseAdmin.from('gym_session_cache').upsert(
      {
        user_id: userId,
        token_encrypted: encrypted,
        expires_at: expiresAt,
        updated_at: new Date(nowMs).toISOString(),
      },
      { onConflict: 'user_id' },
    );
  } catch (_err) {
    // Best-effort cache write: never fail a user request if the cache table is unavailable.
  }
}

/** Remove any cached InfoYou AuthToken for the user (best-effort). */
export async function invalidateGymToken(supabaseAdmin: SupabaseAdminLike, userId: string): Promise<void> {
  try {
    await supabaseAdmin.from('gym_session_cache').delete().eq('user_id', userId);
  } catch (_err) {
    // Ignore cache cleanup errors.
  }
}

async function readValidCachedToken(
  supabaseAdmin: SupabaseAdminLike,
  userId: string,
  nowMs: number,
): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('gym_session_cache')
      .select('token_encrypted, expires_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data?.token_encrypted || !data?.expires_at) {
      return null;
    }

    const expiresMs = Date.parse(String(data.expires_at));
    if (Number.isNaN(expiresMs) || expiresMs <= nowMs + EXPIRY_BUFFER_MS) {
      return null;
    }

    return await decryptString(String(data.token_encrypted));
  } catch (_err) {
    return null;
  }
}

/**
 * Execute an InfoYou operation using a cached `AuthToken` when valid, falling back
 * to decrypting the user's stored password and calling `gymLogin`.
 */
export async function withGymSession<T>(
  supabaseAdmin: SupabaseAdminLike,
  userId: string,
  operation: (gymToken: string) => Promise<T>,
  options?: GymSessionOptions,
): Promise<T> {
  const nowFn = options?.now || Date.now;
  const loginFn = options?.loginFn || gymLogin;

  const { data: userRow, error: userRowError } = await supabaseAdmin
    .from('users')
    .select('username, password_encrypted')
    .eq('id', userId)
    .maybeSingle();

  if (userRowError || !userRow?.username || !userRow?.password_encrypted) {
    throw new UserCredentialsNotFoundError();
  }

  const cachedToken = await readValidCachedToken(supabaseAdmin, userId, nowFn());
  if (cachedToken) {
    try {
      return await operation(cachedToken);
    } catch (err) {
      const isTimeoutOrNetwork = String(err instanceof Error ? err.message : '')
        .toLowerCase()
        .includes('request failed (');
      const shouldRetry = !isTimeoutOrNetwork
        && (Boolean(options?.idempotent) || isAuthSessionError(err));

      if (!shouldRetry) {
        throw err;
      }
      await invalidateGymToken(supabaseAdmin, userId);
    }
  }

  const password = await decryptString(userRow.password_encrypted);
  const freshToken = await loginFn(userRow.username, password);
  await cacheGymToken(supabaseAdmin, userId, freshToken, options);
  return await operation(freshToken);
}

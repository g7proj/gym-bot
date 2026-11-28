// deno-lint-ignore-file require-await
/**
 * Deno unit tests for `_shared/crypto.ts` and `_shared/gymSession.ts`.
 * Zero external imports so `deno test` executes completely offline in CI and sandboxes.
 */
import { decryptString, encryptString } from '../_shared/crypto.ts';
import {
  cacheGymToken,
  isAuthSessionError,
  UserCredentialsNotFoundError,
  withGymSession,
} from '../_shared/gymSession.ts';

function assertEquals<T>(actual: T, expected: T, message?: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(message || `Expected ${b}, got ${a}`);
  }
}

async function assertRejects(
  fn: () => Promise<unknown>,
  expectedType?: new (...args: never[]) => Error,
  messageSubstring?: string,
): Promise<void> {
  let caught: unknown = null;
  try {
    await fn();
  } catch (err) {
    caught = err;
  }
  if (!caught) {
    throw new Error('Expected promise to reject, but it resolved');
  }
  if (expectedType && !(caught instanceof expectedType)) {
    throw new Error(`Expected ${expectedType.name}, got ${String(caught)}`);
  }
  if (messageSubstring) {
    const text = caught instanceof Error ? caught.message : String(caught);
    if (!text.includes(messageSubstring)) {
      throw new Error(`Expected error "${text}" to include "${messageSubstring}"`);
    }
  }
}

function makeTestKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

interface FakeDbOptions {
  userRow?: { username: string; password_encrypted: string } | null;
  cacheRow?: { token_encrypted: string; expires_at: string } | null;
}

function createFakeSupabaseAdmin(initial: FakeDbOptions) {
  let cacheRow = initial.cacheRow ?? null;
  let deleteCalls = 0;
  let upsertCalls = 0;

  return {
    get state() {
      return { cacheRow, deleteCalls, upsertCalls };
    },
    from(table: string) {
      if (table === 'users') {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return { data: initial.userRow ?? null, error: null };
                  },
                };
              },
            };
          },
        };
      }
      if (table === 'gym_session_cache') {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return { data: cacheRow, error: null };
                  },
                };
              },
            };
          },
          async upsert(row: { token_encrypted: string; expires_at: string }) {
            upsertCalls += 1;
            cacheRow = {
              token_encrypted: row.token_encrypted,
              expires_at: row.expires_at,
            };
            return { error: null };
          },
          delete() {
            return {
              async eq() {
                deleteCalls += 1;
                cacheRow = null;
                return { error: null };
              },
            };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

Deno.test('crypto: AES-256-GCM encryptString / decryptString round-trip', async () => {
  Deno.env.set('ENCRYPTION_KEY', makeTestKey());
  const encrypted = await encryptString('MySecretPassword!42');
  const decrypted = await decryptString(encrypted);
  assertEquals(decrypted, 'MySecretPassword!42');
  await assertRejects(() => decryptString('c2hvcnQ='), Error, 'Encrypted payload is invalid');
});

Deno.test('withGymSession: cache miss logs in, caches encrypted token, and runs operation', async () => {
  Deno.env.set('ENCRYPTION_KEY', makeTestKey());
  const encryptedPassword = await encryptString('gympass');
  const admin = createFakeSupabaseAdmin({
    userRow: { username: 'mario', password_encrypted: encryptedPassword },
  });

  let loginCalls = 0;
  const result = await withGymSession(
    admin,
    'user-1',
    async (token) => `used:${token}`,
    {
      now: () => 1_700_000_000_000,
      loginFn: async (u, p) => {
        loginCalls += 1;
        assertEquals(u, 'mario');
        assertEquals(p, 'gympass');
        return 'fresh-token-1';
      },
    },
  );

  assertEquals(result, 'used:fresh-token-1');
  assertEquals(loginCalls, 1);
  assertEquals(admin.state.upsertCalls, 1);
  const decryptedCached = await decryptString(admin.state.cacheRow!.token_encrypted);
  assertEquals(decryptedCached, 'fresh-token-1');
});

Deno.test('withGymSession: valid cached token skips gymLogin completely', async () => {
  Deno.env.set('ENCRYPTION_KEY', makeTestKey());
  const nowMs = 1_700_000_000_000;
  const encryptedPassword = await encryptString('gympass');
  const admin = createFakeSupabaseAdmin({
    userRow: { username: 'mario', password_encrypted: encryptedPassword },
  });
  await cacheGymToken(admin, 'user-1', 'cached-token-99', { ttlMinutes: 15, now: () => nowMs });

  let loginCalls = 0;
  const result = await withGymSession(
    admin,
    'user-1',
    async (token) => `used:${token}`,
    {
      now: () => nowMs + 60_000, // 1 minute later (still valid)
      loginFn: async () => {
        loginCalls += 1;
        return 'should-not-be-called';
      },
    },
  );

  assertEquals(result, 'used:cached-token-99');
  assertEquals(loginCalls, 0);
});

Deno.test('withGymSession: expired cached token logs in again and refreshes cache', async () => {
  Deno.env.set('ENCRYPTION_KEY', makeTestKey());
  const nowMs = 1_700_000_000_000;
  const encryptedPassword = await encryptString('gympass');
  const admin = createFakeSupabaseAdmin({
    userRow: { username: 'mario', password_encrypted: encryptedPassword },
  });
  await cacheGymToken(admin, 'user-1', 'old-token', { ttlMinutes: 15, now: () => nowMs });

  let loginCalls = 0;
  const result = await withGymSession(
    admin,
    'user-1',
    async (token) => `used:${token}`,
    {
      now: () => nowMs + 16 * 60_000, // Past 15m TTL
      loginFn: async () => {
        loginCalls += 1;
        return 'refreshed-token';
      },
    },
  );

  assertEquals(result, 'used:refreshed-token');
  assertEquals(loginCalls, 1);
});

Deno.test('withGymSession: auth failure on cached token invalidates cache and retries once', async () => {
  Deno.env.set('ENCRYPTION_KEY', makeTestKey());
  const nowMs = 1_700_000_000_000;
  const encryptedPassword = await encryptString('gympass');
  const admin = createFakeSupabaseAdmin({
    userRow: { username: 'mario', password_encrypted: encryptedPassword },
  });
  await cacheGymToken(admin, 'user-1', 'revoked-token', { ttlMinutes: 15, now: () => nowMs });

  let loginCalls = 0;
  const seenTokens: string[] = [];
  const result = await withGymSession(
    admin,
    'user-1',
    async (token) => {
      seenTokens.push(token);
      if (token === 'revoked-token') {
        throw new Error('book failed with HTTP 401: Invalid AuthToken');
      }
      return 'booked-ok';
    },
    {
      idempotent: false,
      now: () => nowMs + 10_000,
      loginFn: async () => {
        loginCalls += 1;
        return 'new-token';
      },
    },
  );

  assertEquals(result, 'booked-ok');
  assertEquals(seenTokens, ['revoked-token', 'new-token']);
  assertEquals(loginCalls, 1);
  assertEquals(admin.state.deleteCalls, 1);
});

Deno.test('withGymSession: business error on non-idempotent call does not retry', async () => {
  Deno.env.set('ENCRYPTION_KEY', makeTestKey());
  const nowMs = 1_700_000_000_000;
  const encryptedPassword = await encryptString('gympass');
  const admin = createFakeSupabaseAdmin({
    userRow: { username: 'mario', password_encrypted: encryptedPassword },
  });
  await cacheGymToken(admin, 'user-1', 'valid-token', { ttlMinutes: 15, now: () => nowMs });

  let operationCalls = 0;
  let loginCalls = 0;
  await assertRejects(
    () =>
      withGymSession(
        admin,
        'user-1',
        async () => {
          operationCalls += 1;
          throw new Error('book not successful: Maximum bookings reached');
        },
        {
          idempotent: false,
          now: () => nowMs + 5_000,
          loginFn: async () => {
            loginCalls += 1;
            return 'unused';
          },
        },
      ),
    Error,
    'Maximum bookings reached',
  );

  assertEquals(operationCalls, 1);
  assertEquals(loginCalls, 0);
});

Deno.test('withGymSession: missing user credentials throws UserCredentialsNotFoundError', async () => {
  Deno.env.set('ENCRYPTION_KEY', makeTestKey());
  const admin = createFakeSupabaseAdmin({ userRow: null });
  await assertRejects(
    () => withGymSession(admin, 'missing-user', async () => 'ok'),
    UserCredentialsNotFoundError,
  );
  assertEquals(isAuthSessionError(new Error('HTTP 401')), true);
  assertEquals(isAuthSessionError(new Error('No seats available')), false);
});

// deno-lint-ignore-file require-await
/**
 * Offline Deno unit tests for `_shared/telegram.ts`.
 */
import {
  formatAutoBookErrorAlert,
  generateLinkToken,
  hashLinkToken,
  processTelegramWebhookUpdate,
  resolveBotUsername,
  sendTelegramMessage,
  verifyTelegramWebhookSecret,
} from '../_shared/telegram.ts';

function assertEquals<T>(actual: T, expected: T, message?: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(message || `Expected ${b}, got ${a}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createMockWebhookDb() {
  const users = new Map<string, { id: string; username: string }>([
    ['user-1', { id: 'user-1', username: 'mario.rossi' }],
  ]);
  const tokens = new Map<string, { token_hash: string; user_id: string; expires_at: string }>();
  const connections = new Map<string, Record<string, unknown>>();

  return {
    tokens,
    connections,
    from(table: string) {
      if (table === 'telegram_link_tokens') {
        return {
          delete() {
            let filterHash = '';
            return {
              eq(_col: string, val: string) {
                filterHash = val;
                return {
                  gt(_expCol: string, nowIso: string) {
                    return {
                      select() {
                        return {
                          async maybeSingle() {
                            const row = tokens.get(filterHash);
                            if (row && row.expires_at > nowIso) {
                              tokens.delete(filterHash);
                              return { data: { user_id: row.user_id }, error: null };
                            }
                            return { data: null, error: null };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === 'users') {
        return {
          select() {
            return {
              eq(_col: string, id: string) {
                return {
                  async maybeSingle() {
                    const u = users.get(id);
                    return { data: u ? { username: u.username } : null, error: null };
                  },
                };
              },
            };
          },
        };
      }
      if (table === 'telegram_connections') {
        return {
          async upsert(row: Record<string, unknown>) {
            connections.set(String(row.user_id), row);
            return { error: null };
          },
          delete() {
            return {
              async eq(col: string, val: string) {
                for (const [uid, conn] of connections.entries()) {
                  if (String(conn[col]) === val) {
                    connections.delete(uid);
                  }
                }
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

Deno.test('verifyTelegramWebhookSecret: validates matching secret in constant time', async () => {
  assertEquals(await verifyTelegramWebhookSecret('wh-secret-999', 'wh-secret-999'), true);
  assertEquals(await verifyTelegramWebhookSecret('wrong', 'wh-secret-999'), false);
  assertEquals(await verifyTelegramWebhookSecret('', 'wh-secret-999'), false);
  assertEquals(await verifyTelegramWebhookSecret('wh-secret-999', ''), false);
});

Deno.test('generateLinkToken: creates Telegram-safe 32-char token and matching SHA-256 hash', async () => {
  const { token, tokenHash } = await generateLinkToken();
  assertEquals(token.length, 32);
  assert(/^[A-Za-z0-9_-]{32}$/.test(token), 'Token must be URL-safe base64 without padding');
  assertEquals(await hashLinkToken(token), tokenHash);
});

Deno.test('formatAutoBookErrorAlert: escapes HTML, redacts URLs, and adds password hint on auth errors', () => {
  const authAlert = formatAutoBookErrorAlert({
    username: 'mario<rossi>',
    targetDate: '2026-05-20',
    targetWeekday: 'wednesday',
    desiredCourses: ['PILATES (18:00)'],
    error: 'Login not successful at https://inforyou.teamsystem.com/secret?p=123',
  });

  assert(authAlert.includes('mario&lt;rossi&gt;'), 'Escapes HTML brackets');
  assert(!authAlert.includes('https://inforyou'), 'Redacts raw URLs');
  assert(authAlert.includes('[redacted-url]'), 'Includes redacted URL placeholder');
  assert(authAlert.includes('password may have expired'), 'Includes password expiry hint');

  const genericAlert = formatAutoBookErrorAlert({
    username: 'mario',
    targetDate: '2026-05-20',
    targetWeekday: 'wednesday',
    desiredCourses: ['YOGA (19:00)'],
    error: 'Maximum daily bookings reached',
  });
  assert(!genericAlert.includes('password may have expired'), 'Omits password hint on non-auth errors');
});

Deno.test('processTelegramWebhookUpdate: consumes single-use token, rejects replay, and supports /stop', async () => {
  const db = createMockWebhookDb();
  const { token, tokenHash } = await generateLinkToken();
  db.tokens.set(tokenHash, {
    token_hash: tokenHash,
    user_id: 'user-1',
    expires_at: '2026-12-01T10:15:00.000Z',
  });

  const sentMessages: { chatId: string; html: string }[] = [];
  const mockSend = async (_botToken: string, chatId: string, html: string) => {
    sentMessages.push({ chatId, html });
    return true;
  };
  const fixedNow = () => new Date('2026-12-01T10:00:00.000Z');

  // 1. Group chat messages are ignored.
  const groupRes = await processTelegramWebhookUpdate(
    db,
    { message: { chat: { id: -1001, type: 'group' }, text: `/start ${token}` } },
    'bot-token',
    { now: fixedNow, sendMessageFn: mockSend },
  );
  assertEquals(groupRes.action, 'ignored_non_private');
  assertEquals(db.connections.size, 0);

  // 2. Private `/start <token>` links account and consumes token.
  const firstRes = await processTelegramWebhookUpdate(
    db,
    {
      message: {
        chat: { id: 778899, type: 'private' },
        from: { username: 'mariorossi' },
        text: `/start ${token}`,
      },
    },
    'bot-token',
    { now: fixedNow, sendMessageFn: mockSend },
  );
  assertEquals(firstRes.action, 'connected');
  assertEquals(db.connections.get('user-1')?.chat_id, '778899');
  assertEquals(db.connections.get('user-1')?.telegram_username, '@mariorossi');
  assert(sentMessages[0].html.includes('Gym Bot connected'), 'Sends confirmation message');

  // 3. Replaying the same token fails because it was already consumed.
  const replayRes = await processTelegramWebhookUpdate(
    db,
    {
      message: {
        chat: { id: 778899, type: 'private' },
        text: `/start ${token}`,
      },
    },
    'bot-token',
    { now: fixedNow, sendMessageFn: mockSend },
  );
  assertEquals(replayRes.action, 'expired_token');

  // 4. `/stop` removes the connection.
  const stopRes = await processTelegramWebhookUpdate(
    db,
    {
      message: {
        chat: { id: 778899, type: 'private' },
        text: '/stop',
      },
    },
    'bot-token',
    { now: fixedNow, sendMessageFn: mockSend },
  );
  assertEquals(stopRes.action, 'disconnected');
  assertEquals(db.connections.size, 0);
});

Deno.test('sendTelegramMessage & resolveBotUsername: never leak botToken on network failure', async () => {
  const secretToken = '123456:SUPER_SECRET_BOT_TOKEN';
  const throwingFetch = (async (url: string | URL | Request) => {
    throw new Error(`Network failure connecting to ${String(url)}`);
  }) as typeof fetch;

  const ok = await sendTelegramMessage(secretToken, '999', '<b>Hello</b>', throwingFetch);
  assertEquals(ok, false);

  let caughtMessage = '';
  try {
    await resolveBotUsername(secretToken, '', throwingFetch);
  } catch (err) {
    caughtMessage = err instanceof Error ? err.message : String(err);
  }
  assert(!caughtMessage.includes(secretToken), 'Error message must never include botToken');
});

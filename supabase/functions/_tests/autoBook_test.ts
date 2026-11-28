/**
 * Deno unit tests for `_shared/autoBook.ts` and `_shared/schedule.ts`.
 * Zero external imports so `deno test` executes completely offline.
 */
import {
  findMatchingLesson,
  isLessonAlreadyBooked,
  runAutoBooking,
  verifyCronSecret,
} from '../_shared/autoBook.ts';
import { encryptString } from '../_shared/crypto.ts';
import {
  getBookingWindowStrings,
  getCalendarMonthWindowStrings,
  getUpcomingRollingWindowStrings,
  getZonedParts,
} from '../_shared/schedule.ts';

function assertEquals<T>(actual: T, expected: T, message?: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(message || `Expected ${b}, got ${a}`);
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

interface MockAutoBookDbConfig {
  users: { id: string; username: string; password_encrypted: string }[];
  preferences: { user_id: string; weekday: string; course: string; lesson_start_time: string }[];
  lockAcquired?: boolean;
  lockStatus?: string;
}

function createMockAutoBookAdmin(config: MockAutoBookDbConfig) {
  const lockUpdates: Record<string, unknown>[] = [];
  let rpcCalls = 0;
  let cacheRow: { token_encrypted: string; expires_at: string } | null = null;

  return {
    get stats() {
      return { rpcCalls, lockUpdates };
    },
    async rpc(fnName: string) {
      if (fnName !== 'acquire_booking_lock') {
        throw new Error(`Unexpected RPC: ${fnName}`);
      }
      rpcCalls += 1;
      return {
        data: [
          {
            acquired: config.lockAcquired ?? true,
            run_id: 'run-uuid-1',
            status: config.lockStatus ?? 'in_progress',
          },
        ],
        error: null,
      };
    },
    from(table: string) {
      if (table === 'users') {
        return {
          select(cols: string) {
            if (cols === 'id, username') {
              return Promise.resolve({
                data: config.users.map(({ id, username }) => ({ id, username })),
                error: null,
              });
            }
            return {
              eq(_col: string, id: string) {
                return {
                  async maybeSingle() {
                    const found = config.users.find((u) => u.id === id);
                    return {
                      data: found
                        ? { username: found.username, password_encrypted: found.password_encrypted }
                        : null,
                      error: null,
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === 'preferences') {
        return {
          select() {
            return {
              async in(_col: string, ids: string[]) {
                return {
                  data: config.preferences.filter((p) => ids.includes(p.user_id)),
                  error: null,
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
            cacheRow = { token_encrypted: row.token_encrypted, expires_at: row.expires_at };
            return { error: null };
          },
          delete() {
            return {
              async eq() {
                cacheRow = null;
                return { error: null };
              },
            };
          },
        };
      }
      if (table === 'booking_daily_lock') {
        return {
          update(values: Record<string, unknown>) {
            return {
              async match(filter: Record<string, unknown>) {
                lockUpdates.push({ ...values, ...filter });
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

Deno.test('verifyCronSecret: accepts valid bearer token and rejects invalid or empty secrets', async () => {
  assertEquals(await verifyCronSecret('Bearer top-secret-123', 'top-secret-123'), true);
  assertEquals(await verifyCronSecret('Bearer wrong-secret', 'top-secret-123'), false);
  assertEquals(await verifyCronSecret('', 'top-secret-123'), false);
  assertEquals(await verifyCronSecret('Bearer top-secret-123', ''), false);
});

Deno.test('schedule: Europe/Rome 20-day booking window and weekday resolution', () => {
  const window = getBookingWindowStrings('2026-05-01');
  assertEquals(window.startDate, '2026-05-01T00:00:00');
  assertEquals(window.endDate, '2026-05-20T00:00:00');
  assertEquals(window.targetDate, '2026-05-20');
  assertEquals(window.targetWeekday, 'wednesday');

  // 2026-05-01T05:30:00Z is 07:30 CEST in Europe/Rome
  const zoned = getZonedParts('Europe/Rome', new Date('2026-05-01T05:30:00Z'));
  assertEquals(zoned.isoDate, '2026-05-01');
  assertEquals(zoned.hour, 7);
});

Deno.test('schedule: calendar month and rolling windows handle year rollover and leap years', () => {
  // December -> January year rollover
  const decWindow = getCalendarMonthWindowStrings(
    'Europe/Rome',
    new Date('2026-12-15T10:00:00Z'),
  );
  assertEquals(decWindow.startDate, '2026-12-01');
  assertEquals(decWindow.currentMonthEndDate, '2026-12-31');
  assertEquals(decWindow.endIso, '2027-01-31T23:59:59');

  // Leap year February 2028
  const febWindow = getCalendarMonthWindowStrings(
    'Europe/Rome',
    new Date('2028-02-10T10:00:00Z'),
  );
  assertEquals(febWindow.startDate, '2028-02-01');
  assertEquals(febWindow.currentMonthEndDate, '2028-02-29');
  assertEquals(febWindow.endIso, '2028-03-31T23:59:59');

  // 14-day rolling window starting tomorrow
  const rolling = getUpcomingRollingWindowStrings(
    14,
    'Europe/Rome',
    new Date('2026-05-01T10:00:00Z'),
  );
  assertEquals(rolling.startIso, '2026-05-02T00:00:00');
  assertEquals(rolling.endIso, '2026-05-15T23:59:59');
});

Deno.test('findMatchingLesson: matches exact course name rather than substring', () => {
  const lessons = [
    {
      IDLesson: 1,
      ServiceDescription: 'PILATES MAT',
      StartTime: '1900-01-01T18:00:00',
    },
    {
      IDLesson: 2,
      ServiceDescription: 'PILATES',
      StartTime: '1900-01-01T18:00:00',
    },
  ];
  const matched = findMatchingLesson(lessons, 'pilates', '18:00:00');
  assertEquals(matched?.IDLesson, 2);
  assertEquals(findMatchingLesson(lessons, 'yoga', '18:00:00'), null);
});

Deno.test('isLessonAlreadyBooked: checks UserPositionWaitingList and IsUserPresent', () => {
  assertEquals(isLessonAlreadyBooked({ IsUserPresent: 0, UserPositionWaitingList: 2 }), true);
  assertEquals(isLessonAlreadyBooked({ IsUserPresent: 1, UserPositionWaitingList: 0 }), true);
  assertEquals(isLessonAlreadyBooked({ IsUserPresent: false, WaitingListPosition: 1 }), true);
  assertEquals(isLessonAlreadyBooked({ IsUserPresent: 0, UserPositionWaitingList: 0 }), false);
});

Deno.test('runAutoBooking: skips when before 07:00 Europe/Rome unless forceTime is true', async () => {
  Deno.env.set('ENCRYPTION_KEY', makeTestKey());
  const admin = createMockAutoBookAdmin({ users: [], preferences: [] });

  // 04:00 UTC in May = 06:00 CEST (< 07:00)
  const skipped = await runAutoBooking(admin, {
    timeZone: 'Europe/Rome',
    now: () => new Date('2026-05-01T04:00:00Z'),
  });
  assertEquals(skipped.skippedByTimeGate, true);
});

Deno.test('runAutoBooking: marks lock failed when booking returns Successful=false', async () => {
  Deno.env.set('ENCRYPTION_KEY', makeTestKey());
  const encryptedPw = await encryptString('gympass');
  const admin = createMockAutoBookAdmin({
    users: [{ id: 'user-1', username: 'mario', password_encrypted: encryptedPw }],
    preferences: [
      { user_id: 'user-1', weekday: 'wednesday', course: 'pilates', lesson_start_time: '18:00:00' },
    ],
  });

  const summary = await runAutoBooking(admin, {
    timeZone: 'Europe/Rome',
    now: () => new Date('2026-05-01T05:30:00Z'), // 07:30 CEST -> target 2026-05-20 (wednesday)
    loginFn: async () => 'gym-token-1',
    listLessonsFn: async () => ({
      Items: [
        {
          IDLesson: 101,
          IDServizio: 55,
          DateLesson: '2026-05-20T00:00:00',
          StartTime: '1900-01-01T18:00:00',
          EndTime: '1900-01-01T19:00:00',
          CategoryDescription: 'CORSI FIT',
          ServiceDescription: 'PILATES',
          AvailablePlaces: 5,
          IsUserPresent: 0,
          UserPositionWaitingList: 0,
        },
      ],
    }),
    bookLessonFn: async () => ({
      Successful: false,
      ErrorMessage: 'Temporary upstream failure',
    }),
  });

  assertEquals(summary.failedUsers, 1);
  assertEquals(admin.stats.rpcCalls, 1);
  assertEquals(admin.stats.lockUpdates.length, 1);
  assertEquals(admin.stats.lockUpdates[0].status, 'failed');
});

Deno.test('runAutoBooking: dryRun skips lock RPC, lock updates, and bookLesson calls', async () => {
  Deno.env.set('ENCRYPTION_KEY', makeTestKey());
  const encryptedPw = await encryptString('gympass');
  const admin = createMockAutoBookAdmin({
    users: [{ id: 'user-1', username: 'mario', password_encrypted: encryptedPw }],
    preferences: [
      { user_id: 'user-1', weekday: 'wednesday', course: 'pilates', lesson_start_time: '18:00:00' },
    ],
  });

  let bookCalls = 0;
  const summary = await runAutoBooking(admin, {
    dryRun: true,
    timeZone: 'Europe/Rome',
    now: () => new Date('2026-05-01T05:30:00Z'),
    loginFn: async () => 'gym-token-1',
    listLessonsFn: async () => ({
      Items: [
        {
          IDLesson: 101,
          IDServizio: 55,
          DateLesson: '2026-05-20T00:00:00',
          StartTime: '1900-01-01T18:00:00',
          EndTime: '1900-01-01T19:00:00',
          CategoryDescription: 'CORSI FIT',
          ServiceDescription: 'PILATES',
          AvailablePlaces: 5,
          IsUserPresent: 0,
          UserPositionWaitingList: 0,
        },
      ],
    }),
    bookLessonFn: async () => {
      bookCalls += 1;
      return { Successful: true };
    },
  });

  assertEquals(bookCalls, 0);
  assertEquals(admin.stats.rpcCalls, 0);
  assertEquals(admin.stats.lockUpdates.length, 0);
  assertEquals(summary.wouldBookCount, 1);
  assertEquals(summary.results[0].slots[0].outcome, 'would_book');
});
